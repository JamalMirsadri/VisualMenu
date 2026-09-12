import {
  AuditAction,
  BillingInterval,
  NotificationSeverity,
  NotificationType,
  Prisma,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../../prisma';
import { AuditService } from '../auditService';
import { NotificationService } from '../notificationService';
import { realtimeService } from '../realtimeService';

export interface CreateSubscriptionInput {
  restaurantId: string;
  planId: string;
  provider?: string;
  providerCustomerId?: string;
  providerSubscriptionId?: string;
  actorId?: string;
}

export interface ExtendSubscriptionInput {
  subscriptionId: string;
  days: number;
  reason: string;
  actorId?: string;
}

export class SubscriptionService {
  /**
   * Helper to calculate period end given start date, billing interval, and count
   */
  static calculateNextPeriodEnd(startDate: Date, interval: BillingInterval, count: number = 1): Date {
    const end = new Date(startDate.getTime());
    if (interval === BillingInterval.YEARLY) {
      end.setFullYear(end.getFullYear() + count);
    } else {
      end.setMonth(end.getMonth() + count);
    }
    return end;
  }

  /**
   * Helper to validate state transitions
   */
  static isValidTransition(from: SubscriptionStatus, to: SubscriptionStatus): boolean {
    if (from === to) return true;
    const allowed: Record<SubscriptionStatus, SubscriptionStatus[]> = {
      [SubscriptionStatus.PENDING]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, SubscriptionStatus.SUSPENDED],
      [SubscriptionStatus.ACTIVE]: [
        SubscriptionStatus.PAST_DUE,
        SubscriptionStatus.GRACE_PERIOD,
        SubscriptionStatus.EXPIRED,
        SubscriptionStatus.CANCELLED,
        SubscriptionStatus.SUSPENDED,
      ],
      [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED],
      [SubscriptionStatus.GRACE_PERIOD]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED, SubscriptionStatus.SUSPENDED],
      [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED],
      [SubscriptionStatus.CANCELLED]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.SUSPENDED],
      [SubscriptionStatus.SUSPENDED]: [SubscriptionStatus.ACTIVE],
    };

    return allowed[from]?.includes(to) ?? false;
  }

  /**
   * Create a new subscription for a restaurant (starts in PENDING or ACTIVE if trial)
   */
  static async createSubscription(input: CreateSubscriptionInput) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.planId },
    });

    if (!plan || !plan.active) {
      throw new Error('PLAN_NOT_FOUND_OR_INACTIVE');
    }

    const existing = await prisma.subscription.findFirst({
      where: {
        restaurantId: input.restaurantId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD, SubscriptionStatus.PENDING] },
      },
      include: { plan: true },
    });

    if (existing) {
      return existing;
    }

    const now = new Date();
    const trialDays = plan.trialDays || 0;
    let trialEndsAt: Date | null = null;
    let currentPeriodEnd: Date;
    let initialStatus: SubscriptionStatus = SubscriptionStatus.PENDING;

    if (trialDays > 0) {
      trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);
      currentPeriodEnd = trialEndsAt;
      initialStatus = SubscriptionStatus.ACTIVE;
    } else {
      currentPeriodEnd = this.calculateNextPeriodEnd(now, plan.billingInterval, plan.intervalCount);
    }

    const subscription = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          restaurantId: input.restaurantId,
          planId: plan.id,
          status: initialStatus,
          startsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd,
          trialEndsAt,
          autoRenew: true,
          provider: input.provider || 'MOCK',
          providerCustomerId: input.providerCustomerId || null,
          providerSubscriptionId: input.providerSubscriptionId || null,
          agreedPrice: plan.price,
          agreedCurrency: plan.currency,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          eventType: 'SUBSCRIPTION_CREATED',
          fromStatus: null,
          toStatus: initialStatus,
          actorId: input.actorId || null,
          reason: 'Initial subscription creation',
          metadata: {
            planCode: plan.code,
            price: plan.price.toString(),
            currency: plan.currency,
            status: initialStatus,
          },
        },
      });

      return sub;
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: input.actorId,
      action: AuditAction.SUBSCRIPTION_CREATED,
      entityType: 'Subscription',
      entityId: subscription.id,
      newValues: {
        status: initialStatus,
        planCode: plan.code,
        price: plan.price.toString(),
      },
    });

    return subscription;
  }

  /**
   * Activate a subscription
   */
  static async activateSubscription(subscriptionId: string, actorId?: string, reason?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    if (!this.isValidTransition(sub.status, SubscriptionStatus.ACTIVE)) {
      throw new Error(`INVALID_TRANSITION: Cannot transition from ${sub.status} to ACTIVE`);
    }

    const fromStatus = sub.status;
    const now = new Date();
    // If expired or starting from pending with past end date, advance period
    let currentPeriodStart = sub.currentPeriodStart;
    let currentPeriodEnd = sub.currentPeriodEnd;
    if (currentPeriodEnd <= now) {
      currentPeriodStart = now;
      currentPeriodEnd = this.calculateNextPeriodEnd(now, sub.plan.billingInterval, sub.plan.intervalCount);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart,
          currentPeriodEnd,
          graceEndsAt: null,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_ACTIVATED',
          fromStatus,
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: actorId || null,
          reason: reason || 'Subscription activated',
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_ACTIVATED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: { status: SubscriptionStatus.ACTIVE, currentPeriodEnd: updated.currentPeriodEnd.toISOString() },
    });

    try {
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_restored' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking realtime broadcast
    }

    await NotificationService.createNotification({
      restaurantId: updated.restaurantId,
      type: NotificationType.SUBSCRIPTION_ACTIVATED,
      title: 'Subscription Activated',
      message: `Your ${updated.plan.name} subscription is now active until ${updated.currentPeriodEnd.toLocaleDateString()}.`,
      severity: NotificationSeverity.INFO,
    });

    return updated;
  }

  /**
   * Renew a subscription
   */
  static async renewSubscription(
    subscriptionId: string,
    actorId?: string,
    paymentDetails?: { amount?: number; providerTransactionId?: string; idempotencyKey?: string }
  ) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const fromStatus = sub.status;
    const now = new Date();
    let nextStart = sub.currentPeriodEnd;
    if (sub.status === SubscriptionStatus.EXPIRED || sub.currentPeriodEnd <= now) {
      nextStart = now;
    }
    const nextEnd = this.calculateNextPeriodEnd(nextStart, sub.plan.billingInterval, sub.plan.intervalCount);

    const renewalAmount = paymentDetails?.amount !== undefined ? paymentDetails.amount : Number(sub.agreedPrice);
    const invoiceNumber = `INV-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const updated = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.subscriptionPayment.create({
        data: {
          subscriptionId,
          amount: new Prisma.Decimal(renewalAmount),
          currency: sub.agreedCurrency,
          status: SubscriptionPaymentStatus.SUCCEEDED,
          provider: sub.provider,
          providerTransactionId: paymentDetails?.providerTransactionId || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          idempotencyKey: paymentDetails?.idempotencyKey || null,
          paidAt: now,
        },
      });

      // Create invoice record
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId,
          invoiceNumber,
          periodStart: nextStart,
          periodEnd: nextEnd,
          subtotal: new Prisma.Decimal(renewalAmount),
          tax: new Prisma.Decimal(0.0),
          total: new Prisma.Decimal(renewalAmount),
          currency: sub.agreedCurrency,
          status: 'PAID',
          issuedAt: now,
          paidAt: now,
          dueAt: now,
        },
      });

      // Update subscription
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: nextStart,
          currentPeriodEnd: nextEnd,
          graceEndsAt: null,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      // Event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_RENEWED',
          fromStatus,
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: actorId || null,
          reason: 'Subscription renewal succeeded',
          metadata: {
            paymentId: payment.id,
            amount: renewalAmount,
            periodStart: nextStart.toISOString(),
            periodEnd: nextEnd.toISOString(),
          },
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_RENEWED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: updated.currentPeriodStart.toISOString(),
        currentPeriodEnd: updated.currentPeriodEnd.toISOString(),
        amount: renewalAmount,
      },
    });

    try {
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_restored' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking
    }

    await NotificationService.createNotification({
      restaurantId: updated.restaurantId,
      type: NotificationType.SUBSCRIPTION_RENEWED,
      title: 'Subscription Renewed',
      message: `Your ${updated.plan.name} subscription was successfully renewed until ${updated.currentPeriodEnd.toLocaleDateString()}.`,
      severity: NotificationSeverity.INFO,
    });

    return updated;
  }

  /**
   * Cancel auto-renew (remains ACTIVE until currentPeriodEnd)
   */
  static async cancelAutoRenew(subscriptionId: string, actorId?: string, reason?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          autoRenew: false,
          cancelledAt: new Date(),
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_CANCELLED',
          fromStatus: sub.status,
          toStatus: sub.status, // Stays active until period end
          actorId: actorId || null,
          reason: reason || 'Auto-renew cancelled by user',
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: { autoRenew: false },
    });

    return updated;
  }

  /**
   * Resume auto-renew
   */
  static async resumeAutoRenew(subscriptionId: string, actorId?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          autoRenew: true,
          cancelledAt: null,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_REACTIVATED',
          fromStatus: sub.status,
          toStatus: sub.status,
          actorId: actorId || null,
          reason: 'Auto-renew resumed',
        },
      });

      return s;
    });

    return updated;
  }

  /**
   * Platform Admin manual suspension
   */
  static async suspendSubscription(subscriptionId: string, reason: string, actorId?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const fromStatus = sub.status;

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: SubscriptionStatus.SUSPENDED },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_SUSPENDED',
          fromStatus,
          toStatus: SubscriptionStatus.SUSPENDED,
          actorId: actorId || null,
          reason,
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_SUSPENDED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: { status: SubscriptionStatus.SUSPENDED, reason },
    });

    try {
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.SUSPENDED,
        subscriptionId: updated.id,
        reason,
      });
    } catch {
      // Non-blocking
    }

    await NotificationService.createNotification({
      restaurantId: updated.restaurantId,
      type: NotificationType.SUBSCRIPTION_SUSPENDED,
      title: 'Subscription Suspended',
      message: `Your subscription has been suspended: ${reason}`,
      severity: NotificationSeverity.CRITICAL,
    });

    return updated;
  }

  /**
   * Platform Admin restore subscription from SUSPENDED/EXPIRED
   */
  static async restoreSubscription(subscriptionId: string, actorId?: string, reason?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const fromStatus = sub.status;
    const now = new Date();
    let currentPeriodEnd = sub.currentPeriodEnd;
    if (currentPeriodEnd <= now) {
      // Extend by 30 days if already expired
      currentPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.ACTIVE,
          currentPeriodEnd,
          graceEndsAt: null,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_REACTIVATED',
          fromStatus,
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: actorId || null,
          reason: reason || 'Restored by Platform Admin',
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_REACTIVATED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: { status: SubscriptionStatus.ACTIVE, reason },
    });

    try {
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_restored' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking
    }

    await NotificationService.createNotification({
      restaurantId: updated.restaurantId,
      type: NotificationType.SUBSCRIPTION_RESTORED,
      title: 'Subscription Restored',
      message: 'Your restaurant administration access has been restored.',
      severity: NotificationSeverity.INFO,
    });

    return updated;
  }

  /**
   * Platform Admin manual extension (+days)
   */
  static async extendSubscription(input: ExtendSubscriptionInput) {
    if (input.days <= 0) {
      throw new Error('INVALID_EXTENSION_DAYS: Must be greater than 0');
    }

    const sub = await prisma.subscription.findUnique({
      where: { id: input.subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const now = new Date();
    const baseDate = sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
    const newPeriodEnd = new Date(baseDate.getTime() + input.days * 24 * 60 * 60 * 1000);
    const fromStatus = sub.status;

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: input.subscriptionId },
        data: {
          currentPeriodEnd: newPeriodEnd,
          status: SubscriptionStatus.ACTIVE,
          graceEndsAt: null,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: input.subscriptionId,
          eventType: 'SUBSCRIPTION_EXTENDED',
          fromStatus,
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: input.actorId || null,
          reason: input.reason,
          metadata: {
            daysAdded: input.days,
            previousPeriodEnd: sub.currentPeriodEnd.toISOString(),
            newPeriodEnd: newPeriodEnd.toISOString(),
          },
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: input.actorId,
      action: AuditAction.SUBSCRIPTION_EXTENDED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: {
        daysAdded: input.days,
        reason: input.reason,
        newPeriodEnd: newPeriodEnd.toISOString(),
      },
    });

    try {
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
      realtimeService.broadcastToRestaurant(updated.restaurantId, 'subscription_restored' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking
    }

    return updated;
  }

  /**
   * Plan change: updates plan and sets future agreed price without modifying historical payments
   */
  static async changePlan(subscriptionId: string, newPlanId: string, actorId?: string, reason?: string) {
    const newPlan = await prisma.subscriptionPlan.findUnique({
      where: { id: newPlanId },
    });

    if (!newPlan || !newPlan.active) {
      throw new Error('PLAN_NOT_FOUND_OR_INACTIVE');
    }

    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!sub) {
      throw new Error('SUBSCRIPTION_NOT_FOUND');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const s = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          planId: newPlan.id,
          agreedPrice: newPlan.price,
          agreedCurrency: newPlan.currency,
        },
        include: { plan: true },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_PLAN_CHANGED',
          fromStatus: sub.status,
          toStatus: sub.status,
          actorId: actorId || null,
          reason: reason || `Plan changed to ${newPlan.code}`,
          metadata: {
            fromPlan: sub.plan.code,
            toPlan: newPlan.code,
            newPrice: newPlan.price.toString(),
            newCurrency: newPlan.currency,
          },
        },
      });

      return s;
    });

    await AuditService.log({
      restaurantId: updated.restaurantId,
      userId: actorId,
      action: AuditAction.SUBSCRIPTION_PLAN_CHANGED,
      entityType: 'Subscription',
      entityId: updated.id,
      newValues: {
        fromPlan: sub.plan.code,
        toPlan: newPlan.code,
        newPrice: newPlan.price.toString(),
      },
    });

    return updated;
  }

  /**
   * Fetch subscription status for restaurant (tenant-scoped)
   */
  static async getSubscriptionStatus(restaurantId: string) {
    const sub = await prisma.subscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
      },
    });

    if (!sub) {
      return null;
    }

    const now = new Date();
    const diffMs = sub.currentPeriodEnd.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const isExpired = sub.currentPeriodEnd <= now;
    const isGracePeriod = sub.status === SubscriptionStatus.GRACE_PERIOD;

    return {
      ...sub,
      daysRemaining,
      isExpired,
      isGracePeriod,
    };
  }

  /**
   * Evaluate subscriptions and transition ACTIVE -> GRACE_PERIOD -> EXPIRED
   * Called hourly by SubscriptionScheduler
   */
  static async processExpirationTransitions(): Promise<{ graceCount: number; expiredCount: number }> {
    const now = new Date();
    let graceCount = 0;
    let expiredCount = 0;

    // 1. ACTIVE subscriptions whose currentPeriodEnd has passed
    const pastPeriodSubs = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: { lte: now },
      },
      include: { plan: true },
    });

    for (const sub of pastPeriodSubs) {
      const graceDays = sub.plan.gracePeriodDays ?? 7;
      if (graceDays > 0) {
        const graceEndsAt = new Date(sub.currentPeriodEnd.getTime() + graceDays * 24 * 60 * 60 * 1000);
        if (now < graceEndsAt) {
          // Transition to GRACE_PERIOD
          await prisma.$transaction(async (tx) => {
            await tx.subscription.update({
              where: { id: sub.id },
              data: {
                status: SubscriptionStatus.GRACE_PERIOD,
                graceEndsAt,
              },
            });

            await tx.subscriptionEvent.create({
              data: {
                subscriptionId: sub.id,
                eventType: 'SUBSCRIPTION_GRACE_STARTED',
                fromStatus: SubscriptionStatus.ACTIVE,
                toStatus: SubscriptionStatus.GRACE_PERIOD,
                reason: 'Current period ended, grace period entered',
                metadata: { graceEndsAt: graceEndsAt.toISOString() },
              },
            });
          });

          await AuditService.log({
            restaurantId: sub.restaurantId,
            action: AuditAction.SUBSCRIPTION_GRACE_STARTED,
            entityType: 'Subscription',
            entityId: sub.id,
            newValues: { status: SubscriptionStatus.GRACE_PERIOD, graceEndsAt: graceEndsAt.toISOString() },
          });

          try {
            realtimeService.broadcastToRestaurant(sub.restaurantId, 'subscription_status_changed' as any, {
              status: SubscriptionStatus.GRACE_PERIOD,
              subscriptionId: sub.id,
            });
          } catch {
            // Non-blocking
          }

          graceCount++;
          continue;
        }
      }

      // No grace period or grace period already expired
      await this.expireSubscription(sub);
      expiredCount++;
    }

    // 2. GRACE_PERIOD subscriptions whose graceEndsAt has passed
    const expiredGraceSubs = await prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.GRACE_PERIOD,
        graceEndsAt: { lte: now },
      },
      include: { plan: true },
    });

    for (const sub of expiredGraceSubs) {
      await this.expireSubscription(sub);
      expiredCount++;
    }

    return { graceCount, expiredCount };
  }

  private static async expireSubscription(sub: any) {
    await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: sub.id },
        data: {
          status: SubscriptionStatus.EXPIRED,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: sub.id,
          eventType: 'SUBSCRIPTION_EXPIRED',
          fromStatus: sub.status,
          toStatus: SubscriptionStatus.EXPIRED,
          reason: 'Subscription period and grace period expired',
        },
      });
    });

    await AuditService.log({
      restaurantId: sub.restaurantId,
      action: AuditAction.SUBSCRIPTION_EXPIRED,
      entityType: 'Subscription',
      entityId: sub.id,
      newValues: { status: SubscriptionStatus.EXPIRED },
    });

    try {
      realtimeService.broadcastToRestaurant(sub.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.EXPIRED,
        subscriptionId: sub.id,
      });
    } catch {
      // Non-blocking
    }

    await NotificationService.createNotification({
      restaurantId: sub.restaurantId,
      type: NotificationType.SUBSCRIPTION_EXPIRED,
      title: 'Subscription Expired',
      message: 'Your subscription has expired. Renew to restore restaurant administration access.',
      severity: NotificationSeverity.CRITICAL,
    });
  }
}
