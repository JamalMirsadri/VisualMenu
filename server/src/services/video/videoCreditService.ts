import { Prisma, SubscriptionStatus, VideoCreditTransactionType } from '@prisma/client';
import { prisma } from '../../prisma';

type Tx = Prisma.TransactionClient;

export interface VideoCreditBalance {
  balance: number;
  allowance: number;
  granted: number;
  purchased: number;
  used: number;
  refunded: number;
}

export class VideoCreditError extends Error {
  errorCode: string;
  statusCode: number;
  constructor(message: string, errorCode = 'VIDEO_CREDIT_ERROR', statusCode = 400) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

async function getActiveSubscription(tx: Tx, restaurantId: string) {
  return tx.subscription.findFirst({
    where: {
      restaurantId,
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD] },
    },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
}

async function sumLedger(tx: Tx, restaurantId: string): Promise<number> {
  const agg = await tx.videoCreditLedger.aggregate({
    where: { restaurantId },
    _sum: { amount: true },
  });
  return agg._sum.amount ?? 0;
}

/**
 * Idempotently records the subscription plan's included credits as a single
 * PLAN_GRANT ledger entry per active subscription. This keeps the ledger the
 * single source of truth while still reflecting the plan's periodic allowance.
 */
async function ensurePlanGrant(tx: Tx, restaurantId: string): Promise<void> {
  const sub = await getActiveSubscription(tx, restaurantId);
  if (!sub) return;

  const included = sub.plan.includedVideoCredits || 0;
  if (included <= 0) return;

  const existing = await tx.videoCreditLedger.findFirst({
    where: { restaurantId, subscriptionId: sub.id, type: VideoCreditTransactionType.PLAN_GRANT },
  });
  if (existing) return;

  await tx.videoCreditLedger.create({
    data: {
      restaurantId,
      subscriptionId: sub.id,
      amount: included,
      type: VideoCreditTransactionType.PLAN_GRANT,
      reference: `plan-grant:${sub.id}`,
      metadata: { planId: sub.planId, planCode: sub.plan.code, includedVideoCredits: included },
    },
  });
}

export class VideoCreditService {
  /** Lazily grants plan credits and returns the current audited balance. */
  static async getBalanceSummary(restaurantId: string): Promise<VideoCreditBalance> {
    await prisma.$transaction(async (tx) => {
      await ensurePlanGrant(tx, restaurantId);
    });

    const [rows, sub] = await Promise.all([
      prisma.videoCreditLedger.findMany({ where: { restaurantId } }),
      prisma.subscription.findFirst({
        where: {
          restaurantId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.GRACE_PERIOD] },
        },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
    ]);

    let balance = 0;
    let granted = 0;
    let purchased = 0;
    let used = 0;
    let refunded = 0;
    for (const row of rows) {
      balance += row.amount;
      if (row.type === VideoCreditTransactionType.MANUAL_GRANT) granted += row.amount;
      else if (row.type === VideoCreditTransactionType.PURCHASE) purchased += row.amount;
      else if (row.type === VideoCreditTransactionType.USAGE || row.type === VideoCreditTransactionType.EXPIRY) used += Math.abs(row.amount);
      else if (row.type === VideoCreditTransactionType.REFUND) refunded += row.amount;
    }

    return {
      balance,
      allowance: sub?.plan.includedVideoCredits || 0,
      granted,
      purchased,
      used,
      refunded,
    };
  }

  /** Simple numeric balance (post plan-grant). */
  static async getBalance(restaurantId: string): Promise<number> {
    const summary = await this.getBalanceSummary(restaurantId);
    return summary.balance;
  }

  /** Platform/Admin manual credit grant. */
  static async grantManual(
    restaurantId: string,
    amount: number,
    actorId?: string,
    reference?: string,
  ): Promise<{ balance: number; ledgerId: string }> {
    const credits = Math.floor(Number(amount));
    if (!Number.isFinite(credits) || credits <= 0) {
      throw new VideoCreditError('Manual grant amount must be a positive integer.', 'INVALID_CREDIT_AMOUNT');
    }

    const entry = await prisma.videoCreditLedger.create({
      data: {
        restaurantId,
        amount: credits,
        type: VideoCreditTransactionType.MANUAL_GRANT,
        reference: reference || null,
        createdById: actorId || null,
        metadata: { source: 'manual_grant' },
      },
    });

    return { balance: await this.getBalance(restaurantId), ledgerId: entry.id };
  }

  /** Platform/Admin adds a purchased credit pack (auditable purchase + ledger). */
  static async purchaseCredits(restaurantId: string, packId: string, actorId?: string) {
    const pack = await prisma.videoCreditPack.findUnique({ where: { id: packId } });
    if (!pack || !pack.active) {
      throw new VideoCreditError('Credit pack not found or inactive.', 'PACK_NOT_FOUND', 404);
    }

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.videoCreditPurchase.create({
        data: {
          restaurantId,
          packId: pack.id,
          credits: pack.credits,
          amount: pack.price,
          currency: pack.currency,
          status: 'COMPLETED',
          createdById: actorId || null,
        },
      });

      await tx.videoCreditLedger.create({
        data: {
          restaurantId,
          amount: pack.credits,
          type: VideoCreditTransactionType.PURCHASE,
          reference: `purchase:${purchase.id}`,
          createdById: actorId || null,
          metadata: { packId: pack.id, packName: pack.name },
        },
      });

      return purchase;
    });

    return { purchase: result, balance: await this.getBalance(restaurantId) };
  }

  /**
   * Race-safe pre-authorization of exactly one credit. Serialized per restaurant
   * via a PostgreSQL advisory lock so concurrent generations cannot double-spend.
   */
  static async reserveCredit(restaurantId: string, jobId: string): Promise<string> {
    const ledgerId = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${restaurantId}))`;

      await ensurePlanGrant(tx, restaurantId);
      const balance = await sumLedger(tx, restaurantId);
      if (balance <= 0) {
        throw new VideoCreditError(
          'No video credits remaining. Additional credits or a subscription are required.',
          'INSUFFICIENT_VIDEO_CREDITS',
          402,
        );
      }

      const entry = await tx.videoCreditLedger.create({
        data: {
          restaurantId,
          amount: -1,
          type: VideoCreditTransactionType.USAGE,
          reference: jobId,
          metadata: { stage: 'reserved' },
        },
      });
      return entry.id;
    });

    return ledgerId;
  }

  /** Releases a reserved credit (failure/cancellation/storage failure). Idempotent. */
  static async refundCredit(restaurantId: string, jobId: string): Promise<void> {
    const existing = await prisma.videoCreditLedger.findFirst({
      where: { restaurantId, reference: jobId, type: VideoCreditTransactionType.REFUND },
    });
    if (existing) return;

    await prisma.videoCreditLedger.create({
      data: {
        restaurantId,
        amount: 1,
        type: VideoCreditTransactionType.REFUND,
        reference: jobId,
        metadata: { stage: 'released' },
      },
    });
  }

  static async listLedger(restaurantId: string) {
    return prisma.videoCreditLedger.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
