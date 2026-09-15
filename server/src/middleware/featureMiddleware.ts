import { Request, Response, NextFunction } from 'express';
import { resolveRestaurantId } from './authMiddleware';
import { FeatureService } from '../services/featureService';
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
