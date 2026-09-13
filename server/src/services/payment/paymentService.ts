import { Request } from 'express';
import {
  Prisma,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  AuditAction,
} from '@prisma/client';
import { prisma } from '../../prisma';
import { AuditService } from '../auditService';
import { defaultFiscalProvider } from '../fiscal/fiscalProvider';
import { realtimeService } from '../realtimeService';
import { PaymentProvider } from './paymentProvider';
import { MockPaymentProvider } from './mockPaymentProvider';
import { StripePaymentProvider } from './stripePaymentProvider';
import { MBWayPaymentProvider } from './mbwayPaymentProvider';

export interface InitiatePaymentInput {
  orderId: string;
  restaurantId: string;
  method: PaymentMethod;
  phoneNumber?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface RefundInput {
  paymentId: string;
  restaurantId: string;
  amount?: number; // If omitted, full refund
  reason?: string;
  userId?: string;
}

export class PaymentService {
  private static providers: Map<string, PaymentProvider> = new Map<string, PaymentProvider>([
    ['MOCK', new MockPaymentProvider()],
    ['STRIPE', new StripePaymentProvider()],
    ['MBWAY', new MBWayPaymentProvider()],
  ]);

  public static getProvider(name: string): PaymentProvider {
    const p = this.providers.get(name.toUpperCase());
    if (!p) {
      // Default to Mock in development/testing
      return this.providers.get('MOCK')!;
    }
    return p;
  }

  /**
   * Resolves the configured provider for a given payment method
   */
  public static resolveProviderForMethod(method: PaymentMethod): PaymentProvider {
    const configuredProvider = (process.env.PAYMENT_PROVIDER || 'MOCK').toUpperCase();

    if (method === PaymentMethod.CASH) {
      return this.getProvider('MOCK');
    }

    if (method === PaymentMethod.MBWAY) {
      return configuredProvider === 'PRODUCTION' ? this.getProvider('MBWAY') : this.getProvider('MOCK');
    }

    if (method === PaymentMethod.CARD) {
      return configuredProvider === 'PRODUCTION' ? this.getProvider('STRIPE') : this.getProvider('MOCK');
    }

    return this.getProvider('MOCK');
  }

  /**
   * Initiates payment for an order
   */
  public static async initiatePayment(input: InitiatePaymentInput) {
    const { orderId, restaurantId, method, phoneNumber, idempotencyKey, metadata } = input;

    // 1. Fetch Order and verify ownership
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        restaurant: { include: { settings: true } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) {
      const err: any = new Error(`Order ${orderId} was not found.`);
      err.statusCode = 404;
      err.errorCode = 'ORDER_NOT_FOUND';
      throw err;
    }

    if (order.restaurantId !== restaurantId) {
      const err: any = new Error('Order does not belong to this restaurant.');
      err.statusCode = 403;
      err.errorCode = 'ACCESS_DENIED';
      throw err;
    }

    // 2. Idempotency Check: if idempotencyKey provided, check for existing payment with it
    if (idempotencyKey) {
      const existing = order.payments.find(
        (p) => (p.metadata as any)?.idempotencyKey === idempotencyKey
      );
      if (existing) {
        return {
          payment: existing,
          isIdempotentReplay: true,
        };
      }
    }

    // 3. Check if already paid
    const paidPayment = order.payments.find((p) => p.status === PaymentStatus.PAID);
    if (paidPayment) {
      const err: any = new Error('This order is already paid.');
      err.statusCode = 400;
      err.errorCode = 'ORDER_ALREADY_PAID';
      throw err;
    }

    // 4. Verify payment method enabled in restaurant settings
    const settings = order.restaurant.settings;
    if (settings) {
      if (method === PaymentMethod.CASH && !settings.cashPaymentEnabled) {
        const err: any = new Error('Cash payment is currently disabled for this restaurant.');
        err.statusCode = 400;
        err.errorCode = 'PAYMENT_METHOD_DISABLED';
        throw err;
      }
      if (method === PaymentMethod.CARD && !settings.cardPaymentEnabled) {
        const err: any = new Error('Card payment is currently disabled for this restaurant.');
        err.statusCode = 400;
        err.errorCode = 'PAYMENT_METHOD_DISABLED';
        throw err;
      }
      if (method === PaymentMethod.MBWAY && !settings.mbwayPaymentEnabled) {
        const err: any = new Error('MB WAY payment is currently disabled for this restaurant.');
        err.statusCode = 400;
        err.errorCode = 'PAYMENT_METHOD_DISABLED';
        throw err;
      }
    }

    // Validate MB WAY phone number
    if (method === PaymentMethod.MBWAY) {
      if (!MBWayPaymentProvider.validatePhoneNumber(phoneNumber)) {
        const err: any = new Error('Invalid Portuguese phone number for MB WAY (must be 9 digits starting with 9).');
        err.statusCode = 400;
        err.errorCode = 'INVALID_PHONE_NUMBER';
        throw err;
      }
    }

    // 5. Authoritative amount from Order
    const amountNum = Number(order.total);
    const provider = this.resolveProviderForMethod(method);

    // 6. Call Provider createPayment
    const providerResult = await provider.createPayment({
      restaurantId,
      orderId,
      amount: amountNum,
      currency: order.currency,
      method,
      phoneNumber,
      metadata: {
        ...metadata,
        idempotencyKey,
      },
    });

    if (!providerResult.success && providerResult.status === PaymentStatus.FAILED) {
      const err: any = new Error(providerResult.error || 'Payment initiation rejected by provider.');
      err.statusCode = 400;
      err.errorCode = 'PAYMENT_REJECTED';
      throw err;
    }

    // 7. Persist Payment in Database
    const payment = await prisma.payment.create({
      data: {
        restaurantId,
        orderId,
        method,
        provider: provider.name,
        providerPaymentId: providerResult.providerPaymentId || null,
        status: providerResult.status,
        amount: order.total,
        currency: order.currency,
        completedAt: providerResult.status === PaymentStatus.PAID ? new Date() : null,
        metadata: {
          idempotencyKey,
          clientSecret: providerResult.clientSecret,
          approvalUrl: providerResult.approvalUrl,
          ...(providerResult.metadata || {}),
        },
      },
    });

    // If provider immediately returned PAID (e.g. mock test), record transaction and receipt
    if (providerResult.status === PaymentStatus.PAID) {
      await prisma.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: PaymentTransactionType.SALE,
          amount: payment.amount,
          currency: payment.currency,
          status: 'SUCCESS',
          metadata: { provider: provider.name },
        },
      });

      await defaultFiscalProvider.issueDocument({
        restaurantId,
        orderId,
        paymentId: payment.id,
        customerTaxId: order.customerTaxId || undefined,
        customerTaxCountry: order.customerTaxCountry || undefined,
        customerName: order.customerName || undefined,
        customerEmail: order.customerEmail || undefined,
      }).catch((e) => console.error('Error auto-generating receipt:', e));

      realtimeService.notifyPaymentStatusChanged(
        restaurantId,
        order.publicToken,
        {
          paymentId: payment.id,
          orderId,
          status: PaymentStatus.PAID,
          method,
          amount: Number(payment.amount),
          currency: payment.currency,
        },
        order
      );
    }

    return {
      payment,
      clientSecret: providerResult.clientSecret,
      approvalUrl: providerResult.approvalUrl,
      providerPaymentId: providerResult.providerPaymentId,
    };
  }

  /**
   * Processes an incoming webhook event idempotently
   */
  public static async processWebhook(providerName: string, req: Request) {
    const provider = this.getProvider(providerName);
    const verification = await provider.verifyWebhook(req);

    if (!verification.valid) {
      const err: any = new Error(verification.error || 'Webhook verification failed.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_WEBHOOK_SIGNATURE';
      throw err;
    }

    const { providerEventId, eventType, providerPaymentId, status, payload } = verification;

    // Idempotency: Check if webhook already processed
    const existingEvent = await prisma.paymentWebhookEvent.findUnique({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId,
        },
      },
    });

    if (existingEvent && existingEvent.processed) {
      return {
        processed: true,
        duplicate: true,
        isDuplicate: true,
        message: 'Duplicate webhook event already processed.',
      };
    }

    // Record webhook event
    await prisma.paymentWebhookEvent.upsert({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId,
        },
      },
      update: {
        payload: payload as any,
      },
      create: {
        provider: provider.name,
        providerEventId,
        eventType,
        payload: payload as any,
        processed: false,
      },
    });

    // If webhook contains payment update
    if (providerPaymentId) {
      const payment = await prisma.payment.findFirst({
        where: { providerPaymentId },
        include: { order: true },
      });

      if (payment) {
        const newStatus = status || PaymentStatus.PAID;
        const updatedPayment = await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: newStatus,
            completedAt: newStatus === PaymentStatus.PAID ? new Date() : undefined,
            failedAt: newStatus === PaymentStatus.FAILED ? new Date() : undefined,
          },
        });

        if (newStatus === PaymentStatus.PAID) {
          await prisma.paymentTransaction.create({
            data: {
              paymentId: payment.id,
              type: PaymentTransactionType.SALE,
              amount: payment.amount,
              currency: payment.currency,
              status: 'SUCCESS',
              metadata: { eventType, providerEventId },
            },
          });

          await defaultFiscalProvider.issueDocument({
            restaurantId: payment.restaurantId,
            orderId: payment.orderId,
            paymentId: payment.id,
            customerTaxId: payment.order.customerTaxId || undefined,
            customerTaxCountry: payment.order.customerTaxCountry || undefined,
            customerName: payment.order.customerName || undefined,
            customerEmail: payment.order.customerEmail || undefined,
          }).catch((e) => console.error('Error auto-generating receipt on webhook:', e));
        }

        // Emit SSE to customer & staff
        realtimeService.notifyPaymentStatusChanged(
          payment.restaurantId,
          payment.order.publicToken,
          {
            paymentId: payment.id,
            orderId: payment.orderId,
            status: newStatus,
            method: payment.method,
            amount: Number(payment.amount),
            currency: payment.currency,
          },
          payment.order
        );
      }
    }

    // Mark event processed
    await prisma.paymentWebhookEvent.update({
      where: {
        provider_providerEventId: {
          provider: provider.name,
          providerEventId,
        },
      },
      data: {
        processed: true,
        processedAt: new Date(),
      },
    });

    return {
      processed: true,
      providerEventId,
    };
  }

  /**
   * Executes a full or partial refund
   */
  public static async refundPayment(input: RefundInput) {
    const { paymentId, restaurantId, amount, reason, userId } = input;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        order: true,
        transactions: true,
      },
    });

    if (!payment) {
      const err: any = new Error(`Payment ${paymentId} was not found.`);
      err.statusCode = 404;
      err.errorCode = 'PAYMENT_NOT_FOUND';
      throw err;
    }

    if (payment.restaurantId !== restaurantId) {
      const err: any = new Error('Payment does not belong to this restaurant.');
      err.statusCode = 403;
      err.errorCode = 'ACCESS_DENIED';
      throw err;
    }

    if (payment.status !== PaymentStatus.PAID && payment.status !== PaymentStatus.PARTIALLY_REFUNDED) {
      const err: any = new Error(`Cannot refund payment with status '${payment.status}'. Only PAID payments can be refunded.`);
      err.statusCode = 400;
      err.errorCode = 'INVALID_PAYMENT_STATUS';
      throw err;
    }

    const capturedTotal = Number(payment.amount);
    const existingRefunds = payment.transactions
      .filter((t) => (t.type === PaymentTransactionType.REFUND || t.type === PaymentTransactionType.PARTIAL_REFUND) && t.status === 'SUCCESS')
      .reduce((acc, t) => acc + Number(t.amount), 0);

    const refundAmountNum = amount !== undefined && amount !== null ? Number(amount) : capturedTotal - existingRefunds;

    if (isNaN(refundAmountNum) || refundAmountNum <= 0) {
      const err: any = new Error('Refund amount must be greater than zero.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_REFUND_AMOUNT';
      throw err;
    }

    if (existingRefunds + refundAmountNum > capturedTotal) {
      const remainingAllowed = Math.max(0, capturedTotal - existingRefunds);
      const err: any = new Error(
        `Refund amount (€${refundAmountNum.toFixed(2)}) exceeds allowable balance. Maximum refundable: €${remainingAllowed.toFixed(2)}.`
      );
      err.statusCode = 400;
      err.errorCode = 'REFUND_EXCEEDS_CAPTURED_AMOUNT';
      throw err;
    }

    const isFullRefund = Math.abs((existingRefunds + refundAmountNum) - capturedTotal) < 0.01;
    const newStatus = isFullRefund ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED;
    const refundType = isFullRefund ? PaymentTransactionType.REFUND : PaymentTransactionType.PARTIAL_REFUND;

    // Contact external provider if non-cash
    if (payment.method !== PaymentMethod.CASH && payment.providerPaymentId) {
      const provider = this.getProvider(payment.provider);
      const providerRefund = await provider.refundPayment({
        providerPaymentId: payment.providerPaymentId,
        amount: refundAmountNum,
        currency: payment.currency,
        reason,
      });

      if (!providerRefund.success) {
        const err: any = new Error(providerRefund.error || 'Payment provider rejected the refund.');
        err.statusCode = 400;
        err.errorCode = 'PROVIDER_REFUND_FAILED';
        throw err;
      }
    }

    const refundDecimal = new Prisma.Decimal(refundAmountNum.toFixed(2));

    // Record transaction & update payment in database
    const updated = await prisma.$transaction(async (tx) => {
      const up = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: newStatus,
        },
      });

      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: refundType,
          amount: refundDecimal,
          currency: payment.currency,
          status: 'SUCCESS',
          metadata: {
            reason,
            refundedByUserId: userId,
          },
        },
      });

      return up;
    });

    // Audit Log
    await AuditService.log({
      restaurantId,
      userId,
      action: AuditAction.CREATE,
      entityType: 'PaymentRefund',
      entityId: payment.id,
      newValues: {
        paymentId: payment.id,
        orderId: payment.orderId,
        refundAmount: refundDecimal.toString(),
        newStatus,
        reason,
      },
    });

    // Real-time SSE
    realtimeService.notifyPaymentStatusChanged(
      restaurantId,
      payment.order.publicToken,
      {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: newStatus,
        method: payment.method,
        amount: Number(payment.amount),
        refundAmount: refundAmountNum,
        currency: payment.currency,
      },
      payment.order
    );

    return {
      payment: updated,
      refundedAmount: refundAmountNum,
      newStatus,
    };
  }
}
