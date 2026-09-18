import crypto from 'crypto';
import { GameStatus, LoyaltyIdentityStatus, PointsTransactionType, RedemptionStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { CustomerService } from './customerService';

const TOKEN_BYTES = 32;

function loyaltyError(statusCode: number, errorCode: string, message: string): Error {
  const e: any = new Error(message);
  e.statusCode = statusCode;
  e.errorCode = errorCode;
  return e;
}

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateRawToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString('hex');
}

/**
 * Returns the start of the calendar day (00:00) for the given instant in the
 * given IANA timezone, as an absolute UTC Date. Mirrors the analytics
 * `zonedToUtc` convention so the daily points limit uses the restaurant's
 * timezone rather than UTC.
 */
export function startOfDayInTz(date: Date, timeZone: string): Date {
  const tz = timeZone || 'UTC';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateParts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== 'literal') dateParts[p.type] = p.value;
  }
  const year = Number(dateParts.year);
  const month = Number(dateParts.month);
  const day = Number(dateParts.day);

  // Resolve (year, month, day) 00:00 local -> UTC via the analytics algorithm.
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const fullDtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const fullParts: Record<string, number> = {};
  for (const p of fullDtf.formatToParts(guess)) {
    if (p.type !== 'literal') fullParts[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(fullParts.year, fullParts.month - 1, fullParts.day, fullParts.hour, fullParts.minute, fullParts.second);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

function resolveWinPoints(pointRules: any): number {
  if (!pointRules || typeof pointRules !== 'object') return 0;
  const value = (pointRules as any).winPoints;
  return typeof value === 'number' && value > 0 ? Math.floor(value) : 0;
}

export interface AwardGameWinResult {
  awarded: boolean;
  amount: number;
  reason?: string;
}

export interface PointsMutationInput {
  restaurantId: string;
  customerId: string;
  amount: number; // always a positive magnitude
  type: PointsTransactionType;
  referenceType?: string | null;
  referenceId?: string | null;
  idempotencyKey?: string | null;
  metadata?: any;
  dailyPointsLimit?: number; // > 0 enforces the daily cap on positive grants
}

/**
 * Restaurant-scoped Loyalty identity + points engine.
 *
 * Identity is keyed by `Customer.id` (internal) and surfaced publicly only
 * through an opaque, hashed token. The `CustomerPointsLedger` table is the
 * immutable audit source of truth; `Customer.loyaltyPoints` is updated
 * atomically in the same transaction.
 */
export class LoyaltyService {
  // ---------------------------------------------------------------------------
  // Identity + token lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Issues (or reactivates) the single active loyalty identity for a customer
   * within a restaurant. Returns the raw token only when a new token is minted;
   * an existing ACTIVE identity returns no raw token (the token is never
   * recoverable from storage).
   */
  static async enroll(restaurantId: string, customerId: string) {
    const existing = await prisma.loyaltyIdentity.findUnique({
      where: { restaurantId_customerId: { restaurantId, customerId } },
    });

    if (existing && existing.status === LoyaltyIdentityStatus.ACTIVE) {
      return { identity: existing, rawToken: null, created: false };
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);

    if (existing) {
      const identity = await prisma.loyaltyIdentity.update({
        where: { id: existing.id },
        data: {
          tokenHash,
          status: LoyaltyIdentityStatus.ACTIVE,
          issuedAt: new Date(),
          revokedAt: null,
        },
      });
      return { identity, rawToken, created: false };
    }

    const identity = await prisma.loyaltyIdentity.create({
      data: {
        restaurantId,
        customerId,
        tokenHash,
        status: LoyaltyIdentityStatus.ACTIVE,
      },
    });
    return { identity, rawToken, created: true };
  }

  /** Rotates the token: mints a fresh raw token, invalidating the previous one. */
  static async rotateToken(restaurantId: string, customerId: string) {
    const existing = await prisma.loyaltyIdentity.findUnique({
      where: { restaurantId_customerId: { restaurantId, customerId } },
    });
    if (!existing) {
      throw loyaltyError(404, 'LOYALTY_IDENTITY_NOT_FOUND', 'No loyalty identity exists for this customer.');
    }

    const rawToken = generateRawToken();
    const identity = await prisma.loyaltyIdentity.update({
      where: { id: existing.id },
      data: {
        tokenHash: hashToken(rawToken),
        status: LoyaltyIdentityStatus.ACTIVE,
        issuedAt: new Date(),
        revokedAt: null,
      },
    });
    return { identity, rawToken };
  }

  /** Revokes the identity token so it can no longer resolve. */
  static async revokeToken(restaurantId: string, customerId: string) {
    const existing = await prisma.loyaltyIdentity.findUnique({
      where: { restaurantId_customerId: { restaurantId, customerId } },
    });
    if (!existing) {
      throw loyaltyError(404, 'LOYALTY_IDENTITY_NOT_FOUND', 'No loyalty identity exists for this customer.');
    }

    const identity = await prisma.loyaltyIdentity.update({
      where: { id: existing.id },
      data: { status: LoyaltyIdentityStatus.REVOKED, revokedAt: new Date() },
    });
    return { identity };
  }

  /** Resolves a raw loyalty token to its identity, scoped to the restaurant. */
  static async resolveIdentityByToken(restaurantId: string, rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw loyaltyError(404, 'LOYALTY_TOKEN_NOT_FOUND', 'Loyalty token not found.');
    }
    const identity = await prisma.loyaltyIdentity.findUnique({
      where: { tokenHash: hashToken(rawToken) },
    });
    if (!identity || identity.restaurantId !== restaurantId) {
      throw loyaltyError(404, 'LOYALTY_TOKEN_NOT_FOUND', 'Loyalty token not found.');
    }
    if (identity.status !== LoyaltyIdentityStatus.ACTIVE) {
      throw loyaltyError(410, 'LOYALTY_TOKEN_REVOKED', 'This loyalty token has been revoked.');
    }
    return identity;
  }

  // ---------------------------------------------------------------------------
  // Customer resolution (reuses existing Customer model; never duplicates)
  // ---------------------------------------------------------------------------

  /** Resolves a customer by loyalty token, scoped to the restaurant. */
  static async resolveCustomerByToken(restaurantId: string, rawToken: string) {
    const identity = await this.resolveIdentityByToken(restaurantId, rawToken);
    const customer = await prisma.customer.findUnique({ where: { id: identity.customerId } });
    if (!customer) {
      throw loyaltyError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    }
    return customer;
  }

  /**
   * Resolves an existing customer by normalized NIF within the same restaurant.
   * Falls back to the customer's fiscal profile. Never creates a customer.
   */
  static async resolveCustomerByNif(restaurantId: string, nif: string) {
    const normalized = (nif || '').trim().toUpperCase();
    if (!normalized) return null;

    const byTaxId = await prisma.customer.findFirst({
      where: { restaurantId, taxId: { equals: normalized, mode: 'insensitive' } },
    });
    if (byTaxId) return byTaxId;

    const profile = await prisma.customerFiscalProfile.findFirst({
      where: { taxId: normalized, customer: { restaurantId } },
      include: { customer: true },
    });
    return profile?.customer ?? null;
  }

  // ---------------------------------------------------------------------------
  // Balance + ledger
  // ---------------------------------------------------------------------------

  static async getBalance(customerId: string) {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { loyaltyPoints: true },
    });
    if (!customer) throw loyaltyError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    return customer.loyaltyPoints;
  }

  static async getLedger(customerId: string, restaurantId: string) {
    return prisma.customerPointsLedger.findMany({
      where: { customerId, restaurantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Points engine
  // ---------------------------------------------------------------------------

  static async credit(input: PointsMutationInput) {
    if (input.amount <= 0) throw loyaltyError(400, 'INVALID_AMOUNT', 'Credit amount must be positive.');
    return this.applyTransaction({
      ...input,
      signedAmount: Math.abs(input.amount),
      enforceDailyLimit: (input.dailyPointsLimit ?? 0) > 0,
    });
  }

  static async debit(input: PointsMutationInput) {
    if (input.amount <= 0) throw loyaltyError(400, 'INVALID_AMOUNT', 'Debit amount must be positive.');
    return this.applyTransaction({
      ...input,
      signedAmount: -Math.abs(input.amount),
      enforceDailyLimit: false,
    });
  }

  private static async applyTransaction(input: {
    restaurantId: string;
    customerId: string;
    signedAmount: number;
    type: PointsTransactionType;
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey?: string | null;
    metadata?: any;
    enforceDailyLimit: boolean;
    dailyPointsLimit?: number;
  }): Promise<{ ledger: any; skipped: boolean }> {
    const { restaurantId, customerId, signedAmount } = input;

    try {
      return await prisma.$transaction(async (tx) => {
        // Exactly-once: reuse an existing ledger entry for this idempotency key.
        if (input.idempotencyKey) {
          const existing = await tx.customerPointsLedger.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (existing) return { ledger: existing, skipped: true };
        }

        // Lock the customer row to serialize concurrent balance mutations.
        const rows = await tx.$queryRaw<Array<{ loyalty_points: number }>>`
          SELECT "loyalty_points" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE
        `;
        if (rows.length === 0) {
          throw loyaltyError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
        }

        const current = rows[0].loyalty_points;
        const newBalance = current + signedAmount;
        if (newBalance < 0) {
          throw loyaltyError(409, 'INSUFFICIENT_POINTS', 'Insufficient points balance.');
        }

        if (input.enforceDailyLimit && (input.dailyPointsLimit ?? 0) > 0) {
          const restaurant = await tx.restaurant.findUnique({
            where: { id: restaurantId },
            select: { timezone: true },
          });
          const todayStart = startOfDayInTz(new Date(), restaurant?.timezone || 'UTC');
          const granted = await tx.customerPointsLedger.aggregate({
            where: { customerId, restaurantId, type: PointsTransactionType.GAME_WIN, createdAt: { gte: todayStart } },
            _sum: { amount: true },
          });
          const todayTotal = granted._sum.amount ?? 0;
          if (todayTotal + signedAmount > input.dailyPointsLimit!) {
            throw loyaltyError(409, 'DAILY_POINTS_LIMIT_EXCEEDED', 'Daily points limit reached.');
          }
        }

        const ledger = await tx.customerPointsLedger.create({
          data: {
            customerId,
            restaurantId,
            amount: signedAmount,
            type: input.type,
            referenceType: input.referenceType ?? null,
            referenceId: input.referenceId ?? null,
            idempotencyKey: input.idempotencyKey ?? null,
            balanceAfter: newBalance,
            metadata: input.metadata ?? undefined,
          },
        });

        await tx.customer.update({
          where: { id: customerId },
          data: { loyaltyPoints: newBalance },
        });

        return { ledger, skipped: false };
      });
    } catch (err: any) {
      // Concurrent duplicate idempotency key surfaces as a unique violation.
      if (err?.code === 'P2002' && input.idempotencyKey) {
        const existing = await prisma.customerPointsLedger.findUnique({
          where: { idempotencyKey: input.idempotencyKey },
        });
        if (existing) return { ledger: existing, skipped: true };
      }
      throw err;
    }
  }

  // ---------------------------------------------------------------------------
  // Game → Loyalty integration
  // ---------------------------------------------------------------------------

  /**
   * Awards game-win points for a FINISHED session, exactly once. CANCELLED or
   * in-progress sessions award nothing. The point amount is read from the
   * server-side GameConfig (never from the client). An anonymous winner (no
   * resolved Customer) is skipped without assigning to anyone else.
   */
  static async awardGameWin(gameSessionId: string): Promise<AwardGameWinResult> {
    const session = await prisma.gameSession.findUnique({
      where: { id: gameSessionId },
      include: { players: true },
    });
    if (!session || session.status !== GameStatus.FINISHED || !session.winnerPlayerId) {
      return { awarded: false, amount: 0, reason: 'not-finished' };
    }

    const winner = session.players.find((p) => p.id === session.winnerPlayerId);
    if (!winner || !winner.customerId) {
      return { awarded: false, amount: 0, reason: 'anonymous-or-unresolved' };
    }

    const config = await prisma.gameConfig.findUnique({ where: { restaurantId: session.restaurantId } });
    const winPoints = resolveWinPoints(config?.pointRules);
    if (winPoints <= 0) {
      return { awarded: false, amount: 0, reason: 'no-points-configured' };
    }

    const idempotencyKey = `game-win:${gameSessionId}`;
    await this.credit({
      restaurantId: session.restaurantId,
      customerId: winner.customerId,
      amount: winPoints,
      type: PointsTransactionType.GAME_WIN,
      referenceType: 'GAME_SESSION',
      referenceId: gameSessionId,
      idempotencyKey,
      dailyPointsLimit: config?.dailyPointsLimit ?? 0,
      metadata: { gameSessionId, gameType: session.gameType, mode: session.mode },
    });

    return { awarded: true, amount: winPoints };
  }

  // ---------------------------------------------------------------------------
  // Rewards + redemption
  // ---------------------------------------------------------------------------

  static async listRewards(restaurantId: string, activeOnly = false) {
    return prisma.reward.findMany({
      where: { restaurantId, ...(activeOnly ? { active: true } : {}) },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  static async listRedemptions(restaurantId: string, customerId: string) {
    return prisma.rewardRedemption.findMany({
      where: { restaurantId, customerId },
      include: { reward: { select: { id: true, name: true, pointsCost: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Redeems a reward for a customer in one atomic transaction: validates the
   * reward, debits points (ledger + balance), creates the redemption, and
   * decrements stock. Deterministic idempotency key prevents duplicate/concurrent
   * double redemption.
   */
  static async redeemReward(
    restaurantId: string,
    customerId: string,
    rewardId: string,
    idempotencyKey?: string | null
  ) {
    if (idempotencyKey) {
      const existing = await prisma.rewardRedemption.findUnique({ where: { idempotencyKey } });
      if (existing) return { redemption: existing, skipped: true };
    }
    const key = idempotencyKey || `redeem:${crypto.randomUUID()}`;

    try {
      return await prisma.$transaction(async (tx) => {
        const custRows = await tx.$queryRaw<Array<{ loyalty_points: number }>>`
          SELECT "loyalty_points" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE
        `;
        if (custRows.length === 0) throw loyaltyError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');

        const rewardRows = await tx.$queryRaw<
          Array<{ restaurant_id: string; points_cost: number; active: boolean; unlimited_stock: boolean; stock: number | null }>
        >`
          SELECT "restaurant_id", "points_cost", "active", "unlimited_stock", "stock"
          FROM "rewards" WHERE "id" = ${rewardId}::uuid FOR UPDATE
        `;
        if (rewardRows.length === 0) throw loyaltyError(404, 'REWARD_NOT_FOUND', 'Reward not found.');
        const reward = rewardRows[0];

        if (reward.restaurant_id !== restaurantId) {
          throw loyaltyError(404, 'REWARD_NOT_FOUND', 'Reward not found.');
        }
        if (!reward.active) throw loyaltyError(409, 'REWARD_INACTIVE', 'This reward is not active.');
        if (!reward.unlimited_stock && (reward.stock == null || reward.stock < 1)) {
          throw loyaltyError(409, 'REWARD_OUT_OF_STOCK', 'This reward is out of stock.');
        }

        const balance = custRows[0].loyalty_points;
        if (balance < reward.points_cost) {
          throw loyaltyError(409, 'INSUFFICIENT_POINTS', 'Insufficient points balance.');
        }
        const newBalance = balance - reward.points_cost;

        const redemption = await tx.rewardRedemption.create({
          data: {
            customerId,
            restaurantId,
            rewardId,
            pointsSpent: reward.points_cost,
            status: RedemptionStatus.COMPLETED,
            idempotencyKey: key,
            redeemedAt: new Date(),
          },
        });

        await tx.customerPointsLedger.create({
          data: {
            customerId,
            restaurantId,
            amount: -reward.points_cost,
            type: PointsTransactionType.REWARD_REDEEM,
            referenceType: 'REDEMPTION',
            referenceId: redemption.id,
            idempotencyKey: `redeem-ledger:${key}`,
            balanceAfter: newBalance,
          },
        });
        await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } });

        if (!reward.unlimited_stock) {
          await tx.reward.update({ where: { id: rewardId }, data: { stock: (reward.stock ?? 0) - 1 } });
        }

        return { redemption, skipped: false };
      });
    } catch (err: any) {
      if (err?.code === 'P2002' && idempotencyKey) {
        const existing = await prisma.rewardRedemption.findUnique({ where: { idempotencyKey } });
        if (existing) return { redemption: existing, skipped: true };
      }
      throw err;
    }
  }

  /**
   * Refunds/cancels a completed redemption: restores points (REFUND ledger),
   * restores stock, and transitions COMPLETED → CANCELLED. Idempotent via the
   * redemption status and a deterministic refund ledger key.
   */
  static async refundRedemption(
    restaurantId: string,
    customerId: string,
    redemptionId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const redRows = await tx.$queryRaw<
        Array<{ id: string; customer_id: string; restaurant_id: string; reward_id: string; points_spent: number; status: string }>
      >`
        SELECT "id", "customer_id", "restaurant_id", "reward_id", "points_spent", "status"
        FROM "reward_redemptions" WHERE "id" = ${redemptionId}::uuid FOR UPDATE
      `;
      if (redRows.length === 0) throw loyaltyError(404, 'REDEMPTION_NOT_FOUND', 'Redemption not found.');
      const red = redRows[0];

      if (red.restaurant_id !== restaurantId || red.customer_id !== customerId) {
        throw loyaltyError(404, 'REDEMPTION_NOT_FOUND', 'Redemption not found.');
      }

      if (red.status === 'CANCELLED') {
        return { redemption: { id: red.id, status: 'CANCELLED' }, skipped: true };
      }
      if (red.status !== 'COMPLETED') {
        throw loyaltyError(409, 'INVALID_REDEMPTION_STATUS', 'Only completed redemptions can be refunded.');
      }

      const custRows = await tx.$queryRaw<Array<{ loyalty_points: number }>>`
        SELECT "loyalty_points" FROM "customers" WHERE "id" = ${customerId}::uuid FOR UPDATE
      `;
      if (custRows.length === 0) throw loyaltyError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
      const newBalance = custRows[0].loyalty_points + red.points_spent;

      await tx.customerPointsLedger.create({
        data: {
          customerId,
          restaurantId,
          amount: red.points_spent,
          type: PointsTransactionType.REFUND,
          referenceType: 'REDEMPTION',
          referenceId: redemptionId,
          idempotencyKey: `refund-ledger:${redemptionId}`,
          balanceAfter: newBalance,
        },
      });
      await tx.customer.update({ where: { id: customerId }, data: { loyaltyPoints: newBalance } });

      const reward = await tx.reward.findUnique({ where: { id: red.reward_id }, select: { unlimitedStock: true } });
      if (reward && !reward.unlimitedStock) {
        await tx.reward.update({ where: { id: red.reward_id }, data: { stock: { increment: 1 } } });
      }

      const updated = await tx.rewardRedemption.update({
        where: { id: redemptionId },
        data: { status: RedemptionStatus.CANCELLED },
      });

      return { redemption: updated, skipped: false };
    });
  }
}

/**
 * Resolves (or creates) a restaurant customer for loyalty enrollment, reusing
 * the existing checkout resolution path so a duplicate Customer is never made.
 * NIF/taxId is optional.
 */
export async function resolveEnrollmentCustomer(input: {
  restaurantId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  taxId?: string | null;
  taxCountry?: string;
}) {
  return CustomerService.resolveForCheckout({
    restaurantId: input.restaurantId,
    name: input.name,
    email: input.email,
    phone: input.phone,
    taxId: input.taxId,
    taxCountry: input.taxCountry,
  });
}

/** Sanitized public representation: never exposes Customer.id, taxId or PII. */
export function sanitizeCustomerPublic(customer: any) {
  return {
    name: customer?.name ?? null,
    balance: customer?.loyaltyPoints ?? 0,
  };
}
