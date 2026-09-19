import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AuditAction, GameMode, LoyaltyIdentityStatus, OrderStatus, PointsTransactionType, RedemptionStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticateToken, requirePermission } from '../middleware/authMiddleware';
import { requireFeature } from '../middleware/featureMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { AuditService } from '../services/auditService';
import { LoyaltyService } from '../services/loyaltyService';

/**
 * Restaurant Admin configuration + loyalty management endpoints.
 *
 * Auth contract: authenticated user + `MANAGE_RESTAURANT_SETTINGS` permission
 * + `GAMES_LOYALTY` entitlement. Platform admins bypass via existing RBAC.
 * Tenant isolation is enforced by `requirePermission` (membership check).
 */
export const gameAdminRouter = Router();

const adminGate = [
  validateUuidParams('restaurantId'),
  authenticateToken,
  requirePermission('MANAGE_RESTAURANT_SETTINGS'),
  requireFeature('GAMES_LOYALTY'),
];

function rewardValidationError(message: string): Error {
  const e: any = new Error(message);
  e.statusCode = 400;
  e.errorCode = 'VALIDATION_ERROR';
  return e;
}

function parseRewardInput(body: any) {
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const pointsCost = Number(body?.pointsCost);
  const unlimitedStock = body?.unlimitedStock === undefined ? true : Boolean(body.unlimitedStock);
  const stock = body?.stock === undefined || body?.stock === null ? null : Number(body.stock);
  const sortOrder = body?.sortOrder === undefined ? 0 : Number(body.sortOrder);

  if (!name) throw rewardValidationError('name is required.');
  if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
    throw rewardValidationError('pointsCost must be a positive number.');
  }
  if (!unlimitedStock && (stock === null || !Number.isFinite(stock) || stock < 0)) {
    throw rewardValidationError('stock is required and must be >= 0 for limited-stock rewards.');
  }

  return {
    name,
    description: body?.description == null ? null : String(body.description),
    pointsCost: Math.floor(pointsCost),
    active: body?.active === undefined ? true : Boolean(body.active),
    unlimitedStock,
    stock: unlimitedStock ? null : Math.floor(stock as number),
    sortOrder: Math.floor(sortOrder),
  };
}

// ---------------------------------------------------------------------------
// Games config (restaurant admin control)
// ---------------------------------------------------------------------------

function gameConfigValidationError(message: string): Error {
  const e: any = new Error(message);
  e.statusCode = 400;
  e.errorCode = 'VALIDATION_ERROR';
  return e;
}

function parseGameConfigInput(body: any) {
  const enabled = Boolean(body?.enabled);
  const modes = Array.isArray(body?.modes)
    ? body.modes.filter((m: any) => m === 'PRIVATE' || m === 'RANDOM')
    : [];
  const minPlayers = Math.floor(Number(body?.minPlayers));
  const maxPlayers = Math.floor(Number(body?.maxPlayers));
  const turnTimeoutSeconds = Math.floor(Number(body?.turnTimeoutSeconds));
  const dailyPointsLimit = Math.floor(Number(body?.dailyPointsLimit));
  const winPoints = Math.floor(Number(body?.pointRules?.winPoints ?? body?.winPoints ?? 0));

  if (!Number.isFinite(minPlayers) || minPlayers < 1) {
    throw gameConfigValidationError('minPlayers must be at least 1.');
  }
  if (!Number.isFinite(maxPlayers) || maxPlayers < minPlayers) {
    throw gameConfigValidationError('maxPlayers must be greater than or equal to minPlayers.');
  }
  if (!Number.isFinite(turnTimeoutSeconds) || turnTimeoutSeconds < 5) {
    throw gameConfigValidationError('turnTimeoutSeconds must be at least 5 seconds.');
  }
  if (!Number.isFinite(dailyPointsLimit) || dailyPointsLimit < 0) {
    throw gameConfigValidationError('dailyPointsLimit must be a non-negative number.');
  }
  if (!Number.isFinite(winPoints) || winPoints < 0) {
    throw gameConfigValidationError('winPoints must be a non-negative number.');
  }
  if (enabled && modes.length === 0) {
    throw gameConfigValidationError('At least one game mode must be enabled when Games are active.');
  }

  return {
    enabled,
    modes: modes as GameMode[],
    minPlayers,
    maxPlayers,
    turnTimeoutSeconds,
    dailyPointsLimit,
    pointRules: { winPoints },
  };
}

gameAdminRouter.get(
  '/restaurants/:restaurantId/games/config',
  validateUuidParams('restaurantId'),
  authenticateToken,
  requirePermission('MANAGE_RESTAURANT_SETTINGS'),
  requireFeature('GAMES_LOYALTY'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const config = await prisma.gameConfig.findUnique({ where: { restaurantId: req.params.restaurantId } });
      res.status(200).json({ success: true, data: { config } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.put(
  '/restaurants/:restaurantId/games/config',
  validateUuidParams('restaurantId'),
  authenticateToken,
  requirePermission('MANAGE_RESTAURANT_SETTINGS'),
  requireFeature('GAMES_LOYALTY'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseGameConfigInput(req.body);
      const config = await prisma.gameConfig.upsert({
        where: { restaurantId: req.params.restaurantId },
        create: { restaurantId: req.params.restaurantId, ...input },
        update: input,
      });
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'GameConfig',
        entityId: config.id,
        metadata: { enabled: config.enabled, modes: config.modes, minPlayers: config.minPlayers, maxPlayers: config.maxPlayers },
      });
      res.status(200).json({ success: true, data: { config } });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Loyalty overview + customer profile helper
// ---------------------------------------------------------------------------

async function buildLoyaltyCodeUrl(restaurantId: string, code: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true },
  });
  const slug = restaurant?.slug || restaurantId;
  return `/menu/${slug}?loyalty=${encodeURIComponent(code)}`;
}

function maxDate(...dates: Array<Date | null | undefined>): Date | null {
  const valid = dates.filter((d): d is Date => Boolean(d));
  if (valid.length === 0) return null;
  return new Date(Math.max(...valid.map((d) => d.getTime())));
}

async function computeCustomerStats(restaurantId: string, customerIds: string[]) {
  const [orderAgg, redemptionAgg, ledgerAgg] = await Promise.all([
    prisma.order.groupBy({
      by: ['customerId'],
      where: { restaurantId, customerId: { in: customerIds }, status: { not: OrderStatus.CANCELLED } },
      _count: { _all: true },
      _sum: { total: true },
      _max: { createdAt: true },
    }),
    prisma.rewardRedemption.groupBy({
      by: ['customerId'],
      where: { restaurantId, customerId: { in: customerIds }, status: RedemptionStatus.COMPLETED },
      _count: { _all: true },
    }),
    prisma.customerPointsLedger.groupBy({
      by: ['customerId'],
      where: { restaurantId, customerId: { in: customerIds } },
      _max: { createdAt: true },
    }),
  ]);

  const orderMap = new Map(orderAgg.map((o) => [o.customerId!, o]));
  const redemptionMap = new Map(redemptionAgg.map((r) => [r.customerId!, r]));
  const ledgerMap = new Map(ledgerAgg.map((l) => [l.customerId!, l]));

  return new Map(
    customerIds.map((id) => {
      const order = orderMap.get(id);
      const redemption = redemptionMap.get(id);
      const ledger = ledgerMap.get(id);
      return [
        id,
        {
          totalOrders: order?._count._all ?? 0,
          totalSpend: Math.round(Number(order?._sum.total ?? 0) * 100) / 100,
          rewardsRedeemed: redemption?._count._all ?? 0,
          lastOrderAt: order?._max.createdAt ?? null,
          lastLedgerAt: ledger?._max.createdAt ?? null,
        },
      ];
    })
  );
}

async function buildCustomerLoyaltyProfile(restaurantId: string, customerId: string) {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, restaurantId },
    select: { id: true, name: true, email: true, phone: true, loyaltyPoints: true, createdAt: true, updatedAt: true },
  });
  if (!customer) return null;

  const [ledger, redemptions, identity, restaurant, stats] = await Promise.all([
    LoyaltyService.getLedger(customer.id, restaurantId),
    LoyaltyService.listRedemptions(restaurantId, customer.id),
    prisma.loyaltyIdentity.findUnique({
      where: { restaurantId_customerId: { restaurantId, customerId } },
      select: { status: true, issuedAt: true, revokedAt: true, code: true },
    }),
    prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    computeCustomerStats(restaurantId, [customerId]),
  ]);

  const stat = stats.get(customerId);
  const lastActivityAt = maxDate(
    stat?.lastOrderAt,
    stat?.lastLedgerAt,
    customer.updatedAt,
    customer.createdAt
  );

  return {
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      balance: customer.loyaltyPoints,
      restaurantName: restaurant?.name ?? null,
      loyaltyCode: identity?.code ?? null,
      registrationDate: identity?.issuedAt ?? customer.createdAt,
      lastActivityAt,
      totalOrders: stat?.totalOrders ?? 0,
      totalSpend: stat?.totalSpend ?? 0,
      rewardsRedeemed: stat?.rewardsRedeemed ?? 0,
      qrUrl: identity?.code ? await buildLoyaltyCodeUrl(restaurantId, identity.code) : null,
    },
    identity: identity
      ? {
          active: identity.status === LoyaltyIdentityStatus.ACTIVE,
          status: identity.status,
          code: identity.code,
          issuedAt: identity.issuedAt,
          revokedAt: identity.revokedAt,
        }
      : null,
    ledger,
    redemptions,
  };
}

gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/overview',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restaurantId = req.params.restaurantId;
      const [totalLoyaltyCustomers, issuedAgg, redeemedAgg, activeRewards, recentRedemptions] = await Promise.all([
        prisma.customer.count({
          where: {
            restaurantId,
            OR: [{ loyaltyPoints: { gt: 0 } }, { loyaltyIdentities: { some: {} } }],
          },
        }),
        prisma.customerPointsLedger.aggregate({ where: { restaurantId, amount: { gt: 0 } }, _sum: { amount: true } }),
        prisma.customerPointsLedger.aggregate({ where: { restaurantId, amount: { lt: 0 } }, _sum: { amount: true } }),
        prisma.reward.count({ where: { restaurantId, active: true } }),
        prisma.rewardRedemption.findMany({
          where: { restaurantId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            reward: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true } },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: {
          totalLoyaltyCustomers,
          totalPointsIssued: issuedAgg._sum.amount ?? 0,
          totalPointsRedeemed: Math.abs(redeemedAgg._sum.amount ?? 0),
          activeRewards,
          recentRedemptions,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Reward catalog (CRUD)
// ---------------------------------------------------------------------------

gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/rewards',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rewards = await LoyaltyService.listRewards(req.params.restaurantId);
      res.status(200).json({ success: true, data: { rewards } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.post(
  '/restaurants/:restaurantId/loyalty/rewards',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseRewardInput(req.body);
      const reward = await prisma.reward.create({
        data: { restaurantId: req.params.restaurantId, ...input },
      });
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'LoyaltyReward',
        entityId: reward.id,
        metadata: { name: reward.name, pointsCost: reward.pointsCost },
      });
      res.status(201).json({ success: true, data: { reward } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.put(
  '/restaurants/:restaurantId/loyalty/rewards/:rewardId',
  [...adminGate, validateUuidParams('rewardId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await prisma.reward.findFirst({ where: { id: req.params.rewardId, restaurantId: req.params.restaurantId } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'REWARD_NOT_FOUND', message: 'Reward not found.' });
        return;
      }
      const input = parseRewardInput(req.body);
      const reward = await prisma.reward.update({ where: { id: req.params.rewardId }, data: input });
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'LoyaltyReward',
        entityId: reward.id,
        metadata: { name: reward.name, pointsCost: reward.pointsCost },
      });
      res.status(200).json({ success: true, data: { reward } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.delete(
  '/restaurants/:restaurantId/loyalty/rewards/:rewardId',
  [...adminGate, validateUuidParams('rewardId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const existing = await prisma.reward.findFirst({ where: { id: req.params.rewardId, restaurantId: req.params.restaurantId } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'REWARD_NOT_FOUND', message: 'Reward not found.' });
        return;
      }
      await prisma.reward.delete({ where: { id: req.params.rewardId } });
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'LoyaltyReward',
        entityId: req.params.rewardId,
        metadata: { name: existing.name },
      });
      res.status(200).json({ success: true, data: { deleted: true } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.patch(
  '/restaurants/:restaurantId/loyalty/rewards/:rewardId/status',
  [...adminGate, validateUuidParams('rewardId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const active = Boolean(req.body?.active);
      const existing = await prisma.reward.findFirst({ where: { id: req.params.rewardId, restaurantId: req.params.restaurantId } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'REWARD_NOT_FOUND', message: 'Reward not found.' });
        return;
      }
      const reward = await prisma.reward.update({ where: { id: req.params.rewardId }, data: { active } });
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
        entityType: 'LoyaltyReward',
        entityId: req.params.rewardId,
        metadata: { name: reward.name },
      });
      res.status(200).json({ success: true, data: { reward } });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin customer + points management
// ---------------------------------------------------------------------------

/**
 * GET /api/restaurants/:restaurantId/loyalty/customers
 * Server-side paginated customer directory (loyalty-identity scoped only).
 * Search: name / loyalty code / NIF / phone. Filter: status. Sort: newest,
 * lastActivity, points. Deterministic tie-break by identity id.
 */
gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/customers',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restaurantId = req.params.restaurantId;
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
      const status = typeof req.query.status === 'string' ? req.query.status : '';
      const sort = typeof req.query.sort === 'string' ? req.query.sort : 'newest';
      const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const skip = (page - 1) * limit;

      const where: any = { restaurantId };
      if (status === 'ACTIVE' || status === 'REVOKED') where.status = status;
      if (search) {
        where.OR = [
          { code: { contains: search, mode: 'insensitive' } },
          { customer: { name: { contains: search, mode: 'insensitive' } } },
          { customer: { taxId: { contains: search, mode: 'insensitive' } } },
          { customer: { phone: { contains: search, mode: 'insensitive' } } },
        ];
      }

      let orderBy: any;
      if (sort === 'lastActivity') {
        orderBy = [{ customer: { updatedAt: 'desc' } }, { id: 'asc' }];
      } else if (sort === 'points') {
        orderBy = [{ customer: { loyaltyPoints: 'desc' } }, { id: 'asc' }];
      } else {
        orderBy = [{ createdAt: 'desc' }, { id: 'asc' }];
      }

      const [total, identities, restaurant] = await Promise.all([
        prisma.loyaltyIdentity.count({ where }),
        prisma.loyaltyIdentity.findMany({
          where,
          orderBy,
          skip,
          take: limit,
          include: { customer: { select: { id: true, name: true, email: true, phone: true, taxId: true, loyaltyPoints: true, createdAt: true, updatedAt: true } } },
        }),
        prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
      ]);

      const stats = await computeCustomerStats(
        restaurantId,
        identities.map((i) => i.customerId)
      );

      const customers = identities.map((identity) => {
        const c = identity.customer;
        const stat = stats.get(c.id);
        const lastActivityAt = maxDate(
          stat?.lastOrderAt,
          stat?.lastLedgerAt,
          c.updatedAt,
          c.createdAt
        );
        return {
          customerId: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          taxId: c.taxId,
          loyaltyCode: identity.code,
          balance: c.loyaltyPoints,
          restaurantName: restaurant?.name ?? null,
          registrationDate: identity.issuedAt ?? c.createdAt,
          lastActivityAt,
          totalOrders: stat?.totalOrders ?? 0,
          totalSpend: stat?.totalSpend ?? 0,
          rewardsRedeemed: stat?.rewardsRedeemed ?? 0,
          identityStatus: identity.status,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          customers,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/customers/lookup',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const taxId = typeof req.query.taxId === 'string' ? req.query.taxId.trim() : '';
      if (!taxId) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'taxId is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByNif(req.params.restaurantId, taxId);
      if (!customer) {
        res.status(404).json({ success: false, errorCode: 'CUSTOMER_NOT_FOUND', message: 'No customer found for this tax identifier.' });
        return;
      }
      const profile = await buildCustomerLoyaltyProfile(req.params.restaurantId, customer.id);
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/customers/:customerId',
  [...adminGate, validateUuidParams('customerId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await buildCustomerLoyaltyProfile(req.params.restaurantId, req.params.customerId);
      if (!profile) {
        res.status(404).json({ success: false, errorCode: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
        return;
      }
      res.status(200).json({ success: true, data: profile });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.post(
  '/restaurants/:restaurantId/loyalty/customers/:customerId/adjust',
  [...adminGate, validateUuidParams('customerId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const amount = Number(req.body?.amount);
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
      if (!Number.isFinite(amount) || amount === 0) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'amount must be a non-zero number.' });
        return;
      }
      if (!reason) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'reason is required.' });
        return;
      }
      const idempotencyKey = `admin-adjust:${crypto.randomUUID()}`;
      const metadata = { reason, actorUserId: req.user?.id };

      if (amount > 0) {
        await LoyaltyService.credit({
          restaurantId: req.params.restaurantId,
          customerId: req.params.customerId,
          amount,
          type: PointsTransactionType.ADMIN_ADJUST,
          idempotencyKey,
          referenceType: 'ADMIN',
          metadata,
        });
      } else {
        await LoyaltyService.debit({
          restaurantId: req.params.restaurantId,
          customerId: req.params.customerId,
          amount: Math.abs(amount),
          type: PointsTransactionType.ADMIN_ADJUST,
          idempotencyKey,
          referenceType: 'ADMIN',
          metadata,
        });
      }

      const balance = await LoyaltyService.getBalance(req.params.customerId);
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'LoyaltyAdjustment',
        entityId: req.params.customerId,
        metadata: { amount, reason },
      });
      res.status(200).json({ success: true, data: { balance } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.post(
  '/restaurants/:restaurantId/loyalty/customers/:customerId/token/revoke',
  [...adminGate, validateUuidParams('customerId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const customer = await prisma.customer.findFirst({
        where: { id: req.params.customerId, restaurantId: req.params.restaurantId },
        select: { id: true },
      });
      if (!customer) {
        res.status(404).json({ success: false, errorCode: 'CUSTOMER_NOT_FOUND', message: 'Customer not found.' });
        return;
      }
      const { identity } = await LoyaltyService.revokeToken(req.params.restaurantId, req.params.customerId);
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'LoyaltyIdentity',
        entityId: req.params.customerId,
        metadata: { action: 'revoke' },
      });
      res.status(200).json({
        success: true,
        data: { identity: { active: false, status: identity.status, revokedAt: identity.revokedAt } },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Admin redemption management
// ---------------------------------------------------------------------------

gameAdminRouter.get(
  '/restaurants/:restaurantId/loyalty/redemptions',
  adminGate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const redemptions = await prisma.rewardRedemption.findMany({
        where: { restaurantId: req.params.restaurantId },
        include: {
          reward: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.status(200).json({ success: true, data: { redemptions } });
    } catch (err) {
      next(err);
    }
  }
);

gameAdminRouter.post(
  '/restaurants/:restaurantId/loyalty/redemptions/:redemptionId/refund',
  [...adminGate, validateUuidParams('redemptionId')],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const redemption = await prisma.rewardRedemption.findFirst({
        where: { id: req.params.redemptionId, restaurantId: req.params.restaurantId },
      });
      if (!redemption) {
        res.status(404).json({ success: false, errorCode: 'REDEMPTION_NOT_FOUND', message: 'Redemption not found.' });
        return;
      }
      const result = await LoyaltyService.refundRedemption(
        req.params.restaurantId,
        redemption.customerId,
        redemption.id
      );
      await AuditService.log({
        restaurantId: req.params.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'LoyaltyRedemption',
        entityId: redemption.id,
        metadata: { pointsSpent: redemption.pointsSpent, skipped: result.skipped },
      });
      res.status(200).json({ success: true, data: { redemption: result.redemption } });
    } catch (err) {
      next(err);
    }
  }
);
