import { Router, Request, Response, NextFunction } from 'express';
import { validateUuidParams } from '../middleware/validation';
import { requirePublicFeature } from '../middleware/featureMiddleware';
import { loyaltyTokenResolutionRateLimiter } from '../middleware/rateLimiter';
import { prisma } from '../prisma';
import { getPublicBaseUrl } from '../config';
import { LoyaltyService, resolveEnrollmentCustomer, sanitizeCustomerPublic } from '../services/loyaltyService';

/**
 * Customer-facing loyalty endpoints (restaurant-scoped, feature-gated).
 *
 * Identity is exposed only via an opaque loyalty token; the internal
 * `Customer.id` / `taxId` / NIF are never returned. Ledger is the immutable
 * audit source of truth (`CustomerPointsLedger`).
 */
export const loyaltyRouter = Router();

const gate = [validateUuidParams('restaurantId'), requirePublicFeature('GAMES_LOYALTY')];

function getToken(req: Request): string | null {
  const bodyToken = req.body && typeof req.body.token === 'string' ? (req.body.token as string) : null;
  const queryToken = req.query && typeof req.query.token === 'string' ? (req.query.token as string) : null;
  return bodyToken || queryToken;
}

/**
 * Builds the canonical customer loyalty deep link (`/menu/:slug?loyalty=:token`).
 * The raw token is embedded only inside the scannable URL, never returned as a
 * bare string to the caller. Uses the configured public base URL when present,
 * otherwise returns a relative path the client can resolve against its origin.
 */
async function buildLoyaltyUrl(restaurantId: string, token: string): Promise<string> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { slug: true },
  });
  const slug = restaurant?.slug || restaurantId;
  const path = `/menu/${slug}?loyalty=${encodeURIComponent(token)}`;
  const base = getPublicBaseUrl();
  return base ? `${base}${path}` : path;
}

/**
 * GET /api/restaurants/:restaurantId/loyalty
 * Loyalty availability (stub-compatible; no identity required).
 */
loyaltyRouter.get('/restaurants/:restaurantId/loyalty', gate, (_req: Request, res: Response): void => {
  res.status(200).json({ success: true, data: { available: true } });
});

/**
 * POST /api/restaurants/:restaurantId/loyalty/enroll
 * Resolve/create a restaurant customer (NIF optional) and issue a loyalty token.
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/enroll',
  gate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, phone, taxId, taxCountry } = req.body || {};
      if (!name && !email && !phone && !taxId) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'At least one identifier (name, email, phone, or taxId) is required.',
        });
        return;
      }

      const customer = await resolveEnrollmentCustomer({
        restaurantId: req.params.restaurantId,
        name,
        email,
        phone,
        taxId,
        taxCountry,
      });

      const { rawToken, created } = await LoyaltyService.enroll(req.params.restaurantId, customer.id);

      const loyaltyUrl = rawToken ? await buildLoyaltyUrl(req.params.restaurantId, rawToken) : null;

      res.status(201).json({
        success: true,
        data: {
          token: rawToken,
          loyaltyUrl,
          alreadyEnrolled: !created && rawToken === null,
          name: customer.name,
          balance: customer.loyaltyPoints ?? 0,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/loyalty/qr?token=...
 * Returns the canonical loyalty deep link (scannable QR URL) for an active token.
 */
loyaltyRouter.get(
  '/restaurants/:restaurantId/loyalty/qr',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      await LoyaltyService.resolveIdentityByToken(req.params.restaurantId, token);
      const loyaltyUrl = await buildLoyaltyUrl(req.params.restaurantId, token);
      res.status(200).json({ success: true, data: { loyaltyUrl } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/loyalty/resolve
 * Resolve a customer by loyalty token (rate-limited, enumeration-protected).
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/resolve',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByToken(req.params.restaurantId, token);
      res.status(200).json({ success: true, data: sanitizeCustomerPublic(customer) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/loyalty/lookup-nif
 * Resolve an existing customer by NIF within the same restaurant (never creates).
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/lookup-nif',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { taxId } = req.body || {};
      if (!taxId || typeof taxId !== 'string') {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'taxId is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByNif(req.params.restaurantId, taxId);
      if (!customer) {
        res.status(404).json({ success: false, errorCode: 'CUSTOMER_NOT_FOUND', message: 'No customer found for this tax identifier.' });
        return;
      }
      res.status(200).json({ success: true, data: sanitizeCustomerPublic(customer) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/loyalty/me?token=...
 * Current loyalty balance for a token.
 */
loyaltyRouter.get(
  '/restaurants/:restaurantId/loyalty/me',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByToken(req.params.restaurantId, token);
      res.status(200).json({ success: true, data: sanitizeCustomerPublic(customer) });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/loyalty/ledger?token=...
 * Ledger/history for a token's customer (no internal ids exposed).
 */
loyaltyRouter.get(
  '/restaurants/:restaurantId/loyalty/ledger',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByToken(req.params.restaurantId, token);
      const ledger = await LoyaltyService.getLedger(customer.id, req.params.restaurantId);
      res.status(200).json({
        success: true,
        data: {
          balance: customer.loyaltyPoints,
          entries: ledger.map((e) => ({
            type: e.type,
            amount: e.amount,
            balanceAfter: e.balanceAfter,
            referenceType: e.referenceType,
            createdAt: e.createdAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/loyalty/token/rotate
 * Rotate a loyalty token (mint a fresh token; invalidates the previous one).
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/token/rotate',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const identity = await LoyaltyService.resolveIdentityByToken(req.params.restaurantId, token);
      const { rawToken } = await LoyaltyService.rotateToken(req.params.restaurantId, identity.customerId);
      res.status(200).json({ success: true, data: { token: rawToken } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/loyalty/token/revoke
 * Revoke a loyalty token so it can no longer resolve.
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/token/revoke',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const identity = await LoyaltyService.resolveIdentityByToken(req.params.restaurantId, token);
      await LoyaltyService.revokeToken(req.params.restaurantId, identity.customerId);
      res.status(200).json({ success: true, data: { revoked: true } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/loyalty/rewards/available
 * List active rewards for the restaurant (no identity required).
 */
loyaltyRouter.get(
  '/restaurants/:restaurantId/loyalty/rewards/available',
  gate,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rewards = await LoyaltyService.listRewards(req.params.restaurantId, true);
      res.status(200).json({
        success: true,
        data: {
          rewards: rewards.map((r) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            pointsCost: r.pointsCost,
            unlimitedStock: r.unlimitedStock,
            stock: r.stock,
            sortOrder: r.sortOrder,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/loyalty/redeem
 * Redeem a reward with a loyalty token (idempotent via idempotencyKey).
 */
loyaltyRouter.post(
  '/restaurants/:restaurantId/loyalty/redeem',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token, rewardId, idempotencyKey } = req.body || {};
      if (!token || !rewardId) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token and rewardId are required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByToken(req.params.restaurantId, token);
      const result = await LoyaltyService.redeemReward(req.params.restaurantId, customer.id, rewardId, idempotencyKey || null);
      const balance = await LoyaltyService.getBalance(customer.id);
      res.status(200).json({
        success: true,
        data: {
          redemptionId: result.redemption.id,
          pointsSpent: result.redemption.pointsSpent,
          status: result.redemption.status,
          balance,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/loyalty/redemptions/me?token=...
 * Redemption history for a token's customer.
 */
loyaltyRouter.get(
  '/restaurants/:restaurantId/loyalty/redemptions/me',
  [...gate, loyaltyTokenResolutionRateLimiter],
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = getToken(req);
      if (!token) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'token is required.' });
        return;
      }
      const customer = await LoyaltyService.resolveCustomerByToken(req.params.restaurantId, token);
      const redemptions = await LoyaltyService.listRedemptions(req.params.restaurantId, customer.id);
      res.status(200).json({
        success: true,
        data: {
          redemptions: redemptions.map((r) => ({
            id: r.id,
            rewardName: r.reward?.name ?? null,
            pointsSpent: r.pointsSpent,
            status: r.status,
            redeemedAt: r.redeemedAt,
            createdAt: r.createdAt,
          })),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
