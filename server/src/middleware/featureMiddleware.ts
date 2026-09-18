import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { resolveRestaurantId } from './authMiddleware';
import { FeatureService } from '../services/featureService';
import { getJwtSecret } from '../config';
import type { FeatureKey } from '../constants/features';

/**
 * Guards a route behind a subscription feature entitlement.
 *
 * - Platform operators always bypass (consistent with existing RBAC bypass).
 * - The restaurant is resolved through the canonical resolver; when missing,
 *   downstream middleware/handlers handle the invalid context.
 * - Denied access returns `403 FEATURE_NOT_AVAILABLE`.
 */
export function requireFeature(feature: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    // Preserve platform-admin bypass logic.
    if (req.user.platformRole) {
      next();
      return;
    }

    const restaurantId = await resolveRestaurantId(req);
    if (!restaurantId) {
      next();
      return;
    }

    const entitled = await FeatureService.hasFeature(restaurantId, feature);
    if (!entitled) {
      res.status(403).json({
        success: false,
        errorCode: 'FEATURE_NOT_AVAILABLE',
        message: `This feature (${feature}) is not available on your subscription plan.`,
      });
      return;
    }

    next();
  };
}

/**
 * Public variant of the feature gate for customer-facing (unauthenticated)
 * endpoints. Resolves the target restaurant, honours platform-admin bypass via
 * the Authorization header, and denies with `403 FEATURE_NOT_AVAILABLE` when
 * the restaurant's subscription does not include the feature.
 */
export function requirePublicFeature(feature: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Platform operators may preview public flows using a Bearer token.
    if (!req.user && req.headers['authorization']) {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (token) {
          const payload = jwt.verify(token, getJwtSecret()) as { userId?: string };
          if (payload?.userId) {
            const user = await prisma.user.findUnique({
              where: { id: payload.userId },
              select: { id: true, platformRole: true },
            });
            if (user?.platformRole) {
              req.user = user as any;
            }
          }
        }
      } catch {
        // Ignore malformed/expired tokens; treat as a normal public request.
      }
    }

    if (req.user?.platformRole) {
      next();
      return;
    }

    const restaurantId = await resolveRestaurantId(req);
    if (!restaurantId) {
      res.status(400).json({
        success: false,
        errorCode: 'RESTAURANT_CONTEXT_REQUIRED',
        message: 'Restaurant context is required.',
      });
      return;
    }

    const entitled = await FeatureService.hasFeature(restaurantId, feature);
    if (!entitled) {
      res.status(403).json({
        success: false,
        errorCode: 'FEATURE_NOT_AVAILABLE',
        message: `This feature (${feature}) is not available on your subscription plan.`,
      });
      return;
    }

    next();
  };
}
