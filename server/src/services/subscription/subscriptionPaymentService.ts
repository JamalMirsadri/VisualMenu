import {
  AuditAction,
  NotificationSeverity,
  NotificationType,
  Prisma,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../../prisma';
import { AuditService } from '../auditService';
import { NotificationService } from '../notificationService';
import { getSubscriptionProvider } from './providers';
import { SubscriptionService } from './subscriptionService';

export interface ProcessPaymentInput {
  subscriptionId: string;
  amount?: number;
  currency?: string;
  provider?: string;
  idempotencyKey?: string;
  providerTransactionId?: string;
  actorId?: string;
}

export class SubscriptionPaymentService {
  /**
   * Process a subscription payment idempotently
   */
  static async processSubscriptionPayment(input: ProcessPaymentInput) {
    const sub = await prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    // Check idempotency
    if (input.idempotencyKey) {
      const existingPayment = await prisma.subscriptionPayment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existingPayment) {
        return {
          payment: existingPayment,
          isDuplicate: true,
          subscription: sub,
        };
      }
    }

    const amount = input.amount !== undefined ? input.amount : Number(sub.agreedPrice);
    const currency = input.currency || sub.agreedCurrency;
    const provider = input.provider || sub.provider;
    const providerTxId = input.providerTransactionId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Renew subscription (which creates the payment and invoice transactionally)
    let updatedSub;
    try {
      updatedSub = await SubscriptionService.renewSubscription(sub.id, input.actorId, {
        amount,
        providerTransactionId: providerTxId,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (err: any) {
      if ((err.code === 'P2002' || err.message?.includes('Unique constraint')) && input.idempotencyKey) {
        const existingPayment = await prisma.subscriptionPayment.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existingPayment) {
          const freshSub = await prisma.subscription.findUnique({
            where: { id: sub.id },
            include: { plan: true },
          });
          return {
            payment: existingPayment,
            isDuplicate: true,
            subscription: freshSub || sub,
          };
        }
      }
      throw err;
    }

    const payment = await prisma.subscriptionPayment.findFirst({
      where: { providerTransactionId: providerTxId },
    });

    return {
      payment,
      isDuplicate: false,
      subscription: updatedSub,
    };
  }

  /**
   * Record a payment failure
   */
  static async recordPaymentFailure(subscriptionId: string, failureReason: string, actorId?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const fromStatus = sub.status;
    const targetStatus = sub.status === SubscriptionStatus.ACTIVE ? SubscriptionStatus.PAST_DUE : sub.status;

    await prisma.$transaction(async (tx) => {
      await tx.subscriptionPayment.create({
        data: {
          subscriptionId,
          amount: sub.agreedPrice,
          currency: sub.agreedCurrency,
          status: SubscriptionPaymentStatus.FAILED,
          provider: sub.provider,
          failureReason,
        },
      });

      if (targetStatus !== sub.status) {
        await tx.subscription.update({
          where: { id: subscriptionId },
          data: { status: targetStatus },
        });

        await tx.subscriptionEvent.create({
          data: {
            subscriptionId,
            eventType: 'SUBSCRIPTION_PAYMENT_FAILED',
            fromStatus,
            toStatus: targetStatus,
            actorId: actorId || null,
            reason: failureReason,
          },
        });
      }
    });

    await AuditService.log({
      restaurantId: sub.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_PAYMENT_FAILED,
      entityType: 'Subscription',
      entityId: sub.id,
      newValues: { failureReason, targetStatus },
    });

    await NotificationService.createNotification({
      restaurantId: sub.restaurantId,
      type: NotificationType.SUBSCRIPTION_PAYMENT_FAILED,
      title: 'Subscription Payment Failed',
      message: `Your payment of ${sub.agreedCurrency} ${sub.agreedPrice} failed: ${failureReason}. Please update your payment method.`,
      severity: NotificationSeverity.CRITICAL,
    });

    return { success: false, failureReason };
  }

  /**
   * Process incoming webhook event idempotently
   */
  static async processWebhook(providerName: string, payload: any, signature?: string) {
    const provider = getSubscriptionProvider(providerName);
    const verification = await provider.verifyWebhook(payload, signature);

    if (!verification.isValid || !verification.eventId) {
      throw new Error('INVALID_WEBHOOK_PAYLOAD_OR_SIGNATURE');
    }

    // Check if webhook was already processed (Idempotency)
    const existingWebhook = await prisma.subscriptionWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId: verification.eventId,
        },
      },
    });

    if (existingWebhook) {
      return {
        processed: true,
        isDuplicate: true,
        message: 'Webhook already processed',
      };
    }

    // Record webhook event in DB
    let webhookRecord;
    try {
      webhookRecord = await prisma.subscriptionWebhookEvent.create({
        data: {
          provider: provider.name,
          providerEventId: verification.eventId,
          eventType: verification.eventType || 'unknown',
          payload: payload as Prisma.InputJsonValue,
          processed: false,
        },
      });
    } catch (err: any) {
      if (err.code === 'P2002' || err.message?.includes('Unique constraint')) {
        return {
          processed: true,
          isDuplicate: true,
          message: 'Webhook already processed concurrently',
        };
      }
      throw err;
    }

    // Handle payment event
    if (verification.subscriptionId) {
      if (verification.status === 'SUCCESS') {
        await SubscriptionService.renewSubscription(verification.subscriptionId, undefined, {
          providerTransactionId: verification.providerTransactionId,
        });
      } else if (verification.status === 'FAILED') {
        await this.recordPaymentFailure(verification.subscriptionId, 'Webhook reported payment failure');
      }
    }

    // Mark webhook as processed
    await prisma.subscriptionWebhookEvent.update({
      where: { id: webhookRecord.id },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return {
      processed: true,
      isDuplicate: false,
      eventId: verification.eventId,
    };
  }
}
