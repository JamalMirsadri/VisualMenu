import {
  AuditAction,
  BillingInterval,
  NotificationSeverity,
  NotificationType,
  Prisma,
  SubscriptionAssignmentType,
  SubscriptionPaymentStatus,
  SubscriptionRequestStatus,
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
    // A subscription must NEVER become ACTIVE automatically. It always starts PENDING
    // and is only activated through the explicit payment / manual-assignment flow.
    const currentPeriodEnd = this.calculateNextPeriodEnd(now, plan.billingInterval, plan.intervalCount);
    const initialStatus: SubscriptionStatus = SubscriptionStatus.PENDING;
    const trialEndsAt: Date | null = null;

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
   * Alias for getSubscriptionStatus for test compatibility
   */
  static async getRestaurantSubscription(restaurantId: string) {
    return this.getSubscriptionStatus(restaurantId);
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

  // =============================================================================
  // PHASE 13C: SUBSCRIPTION REQUEST, PAYMENT ACTIVATION & MANUAL ASSIGN/REVOKE
  // =============================================================================

  /**
   * Owner explicitly requests a subscription
   */
  static async createSubscriptionRequest(input: {
    restaurantId: string;
    requestedPlanId: string;
    requestedByUserId: string;
    notes?: string;
    billingInterval?: BillingInterval;
  }) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
    });
    if (!restaurant) {
      const err: any = new Error('Restaurant not found.');
      err.statusCode = 404;
      err.errorCode = 'RESTAURANT_NOT_FOUND';
      throw err;
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.requestedPlanId },
    });
    if (!plan || !plan.active) {
      const err: any = new Error('Requested plan does not exist or is inactive.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_PLAN';
      throw err;
    }

    const request = await prisma.subscriptionRequest.create({
      data: {
        restaurantId: input.restaurantId,
        requestedPlanId: input.requestedPlanId,
        requestedByUserId: input.requestedByUserId,
        status: SubscriptionRequestStatus.PENDING,
        notes: input.notes?.trim() || null,
        billingInterval: input.billingInterval || plan.billingInterval,
      },
      include: {
        requestedPlan: true,
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: input.requestedByUserId,
      action: AuditAction.SUBSCRIPTION_REQUESTED,
      entityType: 'SubscriptionRequest',
      entityId: request.id,
      newValues: {
        requestedPlanId: input.requestedPlanId,
        planName: plan.name,
        price: plan.price,
        billingInterval: request.billingInterval,
      },
    });

    await NotificationService.createNotification({
      restaurantId: input.restaurantId,
      type: NotificationType.SUBSCRIPTION_REQUESTED,
      title: 'Subscription Requested',
      message: `You have submitted a request for the ${plan.name} plan. Proceed to payment or await platform review.`,
      severity: NotificationSeverity.INFO,
      metadata: {
        requestId: request.id,
        planId: plan.id,
        planName: plan.name,
      },
    });

    try {
      realtimeService.broadcastToRestaurant(input.restaurantId, 'subscription_request_created' as any, {
        requestId: request.id,
        planName: plan.name,
      });
    } catch {
      // Non-blocking
    }

    return request;
  }

  /**
   * Get subscription requests for a restaurant or across platform
   */
  static async getSubscriptionRequests(filter?: {
    restaurantId?: string;
    status?: SubscriptionRequestStatus;
  }) {
    return prisma.subscriptionRequest.findMany({
      where: {
        ...(filter?.restaurantId ? { restaurantId: filter.restaurantId } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
      },
      include: {
        requestedPlan: true,
        requestedByUser: {
          select: { id: true, name: true, email: true },
        },
        reviewedByUser: {
          select: { id: true, name: true, email: true },
        },
        subscription: {
          include: { plan: true },
        },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  /**
   * Platform Admin reviews a subscription request (APPROVE or REJECT)
   */
  static async reviewSubscriptionRequest(input: {
    requestId: string;
    reviewerUserId: string;
    action: 'APPROVE' | 'REJECT';
    rejectionReason?: string;
  }) {
    const request = await prisma.subscriptionRequest.findUnique({
      where: { id: input.requestId },
      include: { requestedPlan: true, restaurant: true },
    });

    if (!request) {
      const err: any = new Error('Subscription request not found.');
      err.statusCode = 404;
      err.errorCode = 'REQUEST_NOT_FOUND';
      throw err;
    }

    const now = new Date();

    if (input.action === 'REJECT') {
      if (!input.rejectionReason || !input.rejectionReason.trim()) {
        const err: any = new Error('Rejection reason is mandatory.');
        err.statusCode = 400;
        err.errorCode = 'REJECTION_REASON_REQUIRED';
        throw err;
      }
      const updated = await prisma.subscriptionRequest.update({
        where: { id: input.requestId },
        data: {
          status: SubscriptionRequestStatus.REJECTED,
          reviewedAt: now,
          reviewedByUserId: input.reviewerUserId,
          rejectionReason: input.rejectionReason?.trim() || 'Request declined by platform administration.',
        },
        include: { requestedPlan: true },
      });

      await AuditService.log({
        restaurantId: request.restaurantId,
        userId: input.reviewerUserId,
        action: AuditAction.UPDATE,
        entityType: 'SubscriptionRequest',
        entityId: request.id,
        newValues: { status: 'REJECTED', reason: updated.rejectionReason },
      });

      await NotificationService.createNotification({
        restaurantId: request.restaurantId,
        type: NotificationType.SYSTEM_ALERT,
        title: 'Subscription Request Declined',
        message: `Your request for the ${request.requestedPlan.name} plan was declined: ${updated.rejectionReason}`,
        severity: NotificationSeverity.WARNING,
      });

      return updated;
    }

    // APPROVE -> Requires Payment (or Complimentary if marked)
    const updated = await prisma.subscriptionRequest.update({
      where: { id: input.requestId },
      data: {
        status: SubscriptionRequestStatus.PAYMENT_REQUIRED,
        reviewedAt: now,
        reviewedByUserId: input.reviewerUserId,
      },
      include: { requestedPlan: true },
    });

    await AuditService.log({
      restaurantId: request.restaurantId,
      userId: input.reviewerUserId,
      action: AuditAction.SUBSCRIPTION_PAYMENT_REQUIRED,
      entityType: 'SubscriptionRequest',
      entityId: request.id,
      newValues: { status: 'PAYMENT_REQUIRED' },
    });

    await NotificationService.createNotification({
      restaurantId: request.restaurantId,
      type: NotificationType.SUBSCRIPTION_PAYMENT_REQUIRED,
      title: 'Subscription Request Approved — Payment Required',
      message: `Your subscription request for ${request.requestedPlan.name} has been approved. Please complete payment to activate.`,
      severity: NotificationSeverity.INFO,
      metadata: {
        requestId: request.id,
        planId: request.requestedPlanId,
      },
    });

    return updated;
  }

  /**
   * Confirm payment and activate subscription
   */
  static async activateFromPayment(input: {
    restaurantId: string;
    planId: string;
    amount: number;
    currency: string;
    provider: string;
    providerTransactionId: string;
    requestId?: string;
    actorUserId?: string;
  }) {
    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.planId },
    });
    if (!plan) {
      const err: any = new Error('Plan not found.');
      err.statusCode = 404;
      err.errorCode = 'PLAN_NOT_FOUND';
      throw err;
    }

    const now = new Date();
    const periodEnd = this.calculateNextPeriodEnd(now, plan.billingInterval, plan.intervalCount);

    const result = await prisma.$transaction(async (tx) => {
      // 1. Find existing active/pending subscription or create new
      let subscription = await tx.subscription.findFirst({
        where: { restaurantId: input.restaurantId },
        orderBy: { createdAt: 'desc' },
      });

      if (subscription) {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            assignmentType: SubscriptionAssignmentType.PAID,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            agreedPrice: new Prisma.Decimal(input.amount),
            agreedCurrency: input.currency,
            provider: input.provider,
            providerSubscriptionId: input.providerTransactionId,
            autoRenew: true,
          },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            restaurantId: input.restaurantId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            assignmentType: SubscriptionAssignmentType.PAID,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
            agreedPrice: new Prisma.Decimal(input.amount),
            agreedCurrency: input.currency,
            provider: input.provider,
            providerSubscriptionId: input.providerTransactionId,
            autoRenew: true,
          },
        });
      }

      // 2. Link and complete request if provided
      if (input.requestId && input.requestId.trim()) {
        await tx.subscriptionRequest.update({
          where: { id: input.requestId.trim() },
          data: {
            status: SubscriptionRequestStatus.PAID,
            subscriptionId: subscription.id,
            reviewedAt: now,
          },
        });
      }

      // 3. Record Payment
      await tx.subscriptionPayment.create({
        data: {
          subscriptionId: subscription.id,
          amount: new Prisma.Decimal(input.amount),
          currency: input.currency,
          status: SubscriptionPaymentStatus.SUCCEEDED,
          provider: input.provider,
          providerTransactionId: input.providerTransactionId,
          paidAt: now,
        },
      });

      // 4. Record Invoice
      const invoiceNumber = `INV-${Date.now().toString().slice(-6)}-${Math.floor(1000 + Math.random() * 9000)}`;
      await tx.subscriptionInvoice.create({
        data: {
          subscriptionId: subscription.id,
          invoiceNumber,
          periodStart: now,
          periodEnd,
          subtotal: new Prisma.Decimal(input.amount),
          total: new Prisma.Decimal(input.amount),
          currency: input.currency,
          status: 'PAID',
          issuedAt: now,
          paidAt: now,
        },
      });

      // 5. Subscription Event
      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: 'SUBSCRIPTION_ACTIVATED_PAYMENT',
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: input.actorUserId || null,
          reason: `Activated via confirmed payment of ${input.currency} ${input.amount}`,
        },
      });

      // 6. Transition Restaurant to ACTIVE if it was SUBSCRIPTION_PENDING
      await tx.restaurant.update({
        where: { id: input.restaurantId },
        data: {
          provisioningStatus: 'ACTIVE',
          activatedAt: now,
        },
      });

      return subscription;
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: input.actorUserId,
      action: AuditAction.SUBSCRIPTION_ACTIVATED,
      entityType: 'Subscription',
      entityId: result.id,
      newValues: {
        planId: plan.id,
        planName: plan.name,
        amount: input.amount,
        currency: input.currency,
        status: SubscriptionStatus.ACTIVE,
        assignmentType: 'PAID',
      },
    });

    await NotificationService.createNotification({
      restaurantId: input.restaurantId,
      type: NotificationType.SUBSCRIPTION_PAYMENT_SUCCESS,
      title: 'Subscription Activated',
      message: `Your payment of ${input.currency} ${input.amount} was confirmed. ${plan.name} plan is now ACTIVE.`,
      severity: NotificationSeverity.INFO,
    });

    try {
      realtimeService.broadcastToRestaurant(input.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: result.id,
      });
    } catch {
      // Non-blocking
    }

    return result;
  }

  /**
   * Platform Admin manually assigns a subscription (MANUAL or COMPLIMENTARY)
   */
  static async manuallyAssignSubscription(input: {
    restaurantId: string;
    planId: string;
    assignmentType: 'MANUAL' | 'COMPLIMENTARY';
    periodEnd: Date;
    reason: string;
    assignedByUserId: string;
    startsAt?: Date;
    agreedPrice?: number;
    currency?: string;
  }) {
    if (!input.reason || !input.reason.trim()) {
      const err: any = new Error('An explicit reason is required for manual subscription assignment.');
      err.statusCode = 400;
      err.errorCode = 'REASON_REQUIRED';
      throw err;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: input.restaurantId },
    });
    if (!restaurant) {
      const err: any = new Error('Restaurant not found.');
      err.statusCode = 404;
      err.errorCode = 'RESTAURANT_NOT_FOUND';
      throw err;
    }

    const plan = await prisma.subscriptionPlan.findUnique({
      where: { id: input.planId },
    });
    if (!plan) {
      const err: any = new Error('Plan not found.');
      err.statusCode = 404;
      err.errorCode = 'PLAN_NOT_FOUND';
      throw err;
    }

    const now = input.startsAt || new Date();
    const agreedPrice = input.agreedPrice !== undefined ? new Prisma.Decimal(input.agreedPrice) : (input.assignmentType === 'COMPLIMENTARY' ? new Prisma.Decimal(0) : plan.price);
    const agreedCurrency = input.currency || plan.currency;

    const result = await prisma.$transaction(async (tx) => {
      let subscription = await tx.subscription.findFirst({
        where: { restaurantId: input.restaurantId },
        orderBy: { createdAt: 'desc' },
      });

      const assignmentTypeEnum = input.assignmentType === 'COMPLIMENTARY'
        ? SubscriptionAssignmentType.COMPLIMENTARY
        : SubscriptionAssignmentType.MANUAL;

      if (subscription) {
        subscription = await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            assignmentType: assignmentTypeEnum,
            assignmentReason: input.reason.trim(),
            assignedByUserId: input.assignedByUserId,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: input.periodEnd,
            agreedPrice,
            agreedCurrency,
            autoRenew: input.assignmentType !== 'COMPLIMENTARY',
            cancelledAt: null,
            endedAt: null,
          },
        });
      } else {
        subscription = await tx.subscription.create({
          data: {
            restaurantId: input.restaurantId,
            planId: plan.id,
            status: SubscriptionStatus.ACTIVE,
            assignmentType: assignmentTypeEnum,
            assignmentReason: input.reason.trim(),
            assignedByUserId: input.assignedByUserId,
            startsAt: now,
            currentPeriodStart: now,
            currentPeriodEnd: input.periodEnd,
            agreedPrice,
            agreedCurrency,
            autoRenew: input.assignmentType !== 'COMPLIMENTARY',
          },
        });
      }

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId: subscription.id,
          eventType: 'SUBSCRIPTION_MANUALLY_ASSIGNED',
          toStatus: SubscriptionStatus.ACTIVE,
          actorId: input.assignedByUserId,
          reason: input.reason.trim(),
          metadata: {
            assignmentType: input.assignmentType,
            agreedPrice: agreedPrice.toString(),
            currentPeriodEnd: input.periodEnd.toISOString(),
          },
        },
      });

      // Ensure restaurant is ACTIVE
      await tx.restaurant.update({
        where: { id: input.restaurantId },
        data: {
          provisioningStatus: 'ACTIVE',
          activatedAt: new Date(),
        },
      });

      return subscription;
    });

    await AuditService.log({
      restaurantId: input.restaurantId,
      userId: input.assignedByUserId,
      action: AuditAction.SUBSCRIPTION_MANUALLY_ASSIGNED,
      entityType: 'Subscription',
      entityId: result.id,
      newValues: {
        assignmentType: input.assignmentType,
        planName: plan.name,
        periodEnd: input.periodEnd.toISOString(),
        reason: input.reason.trim(),
      },
    });

    await NotificationService.createNotification({
      restaurantId: input.restaurantId,
      type: NotificationType.SUBSCRIPTION_RENEWED,
      title: 'Subscription Assigned by Platform',
      message: `A ${input.assignmentType.toLowerCase()} subscription to ${plan.name} has been activated for your restaurant until ${input.periodEnd.toLocaleDateString()}.`,
      severity: NotificationSeverity.INFO,
    });

    try {
      realtimeService.broadcastToRestaurant(input.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: result.id,
      });
    } catch {
      // Non-blocking
    }

    return result;
  }

  /**
   * Platform Admin immediately revokes subscription (immediate suspension)
   */
  static async revokeSubscription(subscriptionId: string, actorUserId: string, reason: string) {
    if (!reason || !reason.trim()) {
      const err: any = new Error('An explicit reason is required to revoke a subscription.');
      err.statusCode = 400;
      err.errorCode = 'REASON_REQUIRED';
      throw err;
    }

    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub) {
      const err: any = new Error('Subscription not found.');
      err.statusCode = 404;
      err.errorCode = 'SUBSCRIPTION_NOT_FOUND';
      throw err;
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          status: SubscriptionStatus.SUSPENDED,
          autoRenew: false,
          endedAt: now,
          cancelledAt: now,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_REVOKED',
          fromStatus: sub.status,
          toStatus: SubscriptionStatus.SUSPENDED,
          actorId: actorUserId,
          reason: reason.trim(),
        },
      });

      return res;
    });

    await AuditService.log({
      restaurantId: sub.restaurantId,
      userId: actorUserId,
      action: AuditAction.SUBSCRIPTION_REVOKED,
      entityType: 'Subscription',
      entityId: subscriptionId,
      oldValues: { status: sub.status },
      newValues: { status: SubscriptionStatus.SUSPENDED, reason: reason.trim() },
    });

    await NotificationService.createNotification({
      restaurantId: sub.restaurantId,
      type: NotificationType.SUBSCRIPTION_EXPIRED,
      title: 'Subscription Revoked',
      message: `Your subscription has been revoked by platform administration: ${reason.trim()}`,
      severity: NotificationSeverity.CRITICAL,
    });

    try {
      realtimeService.broadcastToRestaurant(sub.restaurantId, 'subscription_status_changed' as any, {
        status: SubscriptionStatus.SUSPENDED,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking
    }

    return updated;
  }

  /**
   * Cancel auto-renew: subscription remains ACTIVE until currentPeriodEnd
   */
  static async cancelAutoRenew(subscriptionId: string, actorUserId?: string, reason?: string) {
    const sub = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub) {
      const err: any = new Error('Subscription not found.');
      err.statusCode = 404;
      err.errorCode = 'SUBSCRIPTION_NOT_FOUND';
      throw err;
    }

    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.subscription.update({
        where: { id: subscriptionId },
        data: {
          autoRenew: false,
          cancelledAt: now,
        },
      });

      await tx.subscriptionEvent.create({
        data: {
          subscriptionId,
          eventType: 'SUBSCRIPTION_AUTO_RENEW_CANCELLED',
          fromStatus: sub.status,
          toStatus: sub.status,
          actorId: actorUserId || null,
          reason: reason?.trim() || 'Auto-renew cancelled. Access remains active until period end.',
        },
      });

      return res;
    });

    await AuditService.log({
      restaurantId: sub.restaurantId,
      userId: actorUserId,
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      entityType: 'Subscription',
      entityId: subscriptionId,
      newValues: { autoRenew: false, periodEnd: sub.currentPeriodEnd.toISOString() },
    });

    try {
      realtimeService.broadcastToRestaurant(sub.restaurantId, 'subscription_updated' as any, {
        autoRenew: false,
        subscriptionId: updated.id,
      });
    } catch {
      // Non-blocking
    }

    return updated;
  }
}
