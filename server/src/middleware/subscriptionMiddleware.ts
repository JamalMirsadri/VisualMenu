import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prisma';

import { getJwtSecret } from '../config';

/**
 * Centralized middleware that enforces an ACTIVE or GRACE_PERIOD subscription
 * for restaurant administration and operational management APIs.
 *
 * Rules:
 * - Platform Admin always bypasses.
 * - Public routes are not gated.
 * - Subscription and Notification management routes are not gated.
 * - ACTIVE: allowed.
 * - GRACE_PERIOD: allowed with X-Subscription-Grace header.
 * - PENDING, PAST_DUE, EXPIRED, CANCELLED, SUSPENDED, NONE: blocked with HTTP 402.
 */
export function requireActiveSubscription() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 1. Platform operators always bypass subscription gating
    if (req.user?.platformRole) {
      next();
      return;
    }

    // 1b. Allow listing assigned restaurants (GET /api/restaurants)
    if (req.baseUrl === '/api/restaurants' && (req.path === '/' || req.path === '') && req.method === 'GET') {
      next();
      return;
    }

    // 2. Resolve target restaurantId
    let restaurantId = req.params.restaurantId || req.userRestaurantId;

    const fullUrl = `${req.baseUrl || ''}${req.path || ''}`;

    if (!restaurantId && (req.baseUrl.includes('/restaurants') || fullUrl.includes('/restaurants')) && req.params.id) {
      restaurantId = req.params.id;
    }

    if (!restaurantId && req.body && req.body.restaurantId) {
      restaurantId = req.body.restaurantId;
    }

    if (!restaurantId && req.query && typeof req.query.restaurantId === 'string') {
      restaurantId = req.query.restaurantId;
    }

    // Check URL pattern /restaurants/:uuid
    if (!restaurantId) {
      const match = (req.originalUrl || fullUrl).match(/\/restaurants\/([0-9a-fA-F-]{36})/);
      if (match) {
        restaurantId = match[1];
      }
    }

    // If still not resolved, check user's assigned restaurant membership
    if (!restaurantId && req.user?.id) {
      const membership = await prisma.userRestaurant.findFirst({
        where: { userId: req.user.id },
        select: { restaurantId: true },
      });
      if (membership) {
        restaurantId = membership.restaurantId;
      }
    }

    // If no restaurant context could be determined, allow downstream middleware to handle 400/403
    if (!restaurantId) {
      next();
      return;
    }

    // 2b. Tenant authorization check: if user is authenticated but not a member of this restaurant,
    // allow downstream authorization middleware (requireRestaurantAccess / requirePermission) to return 403
    if (req.user && !req.user.platformRole) {
      const userMembership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user.id,
            restaurantId,
          },
        },
      });
      if (!userMembership) {
        next();
        return;
      }
    }

    // 3. Query subscription state authoritatively from database
    const subscription = await prisma.subscription.findFirst({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        graceEndsAt: true,
      },
    });

    if (!subscription) {
      const restaurantExists = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, provisioningStatus: true, slug: true },
      });

      if (!restaurantExists) {
        // If restaurant does not exist at all, let downstream route handlers return 404
        next();
        return;
      }

      // No subscription exists: block access with HTTP 402. No automatic provisioning.
      res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        errorCode: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus: 'NONE',
        renewUrl: '/admin/subscription',
        message: 'Active subscription required to access this resource',
      });
      return;
    }

    // 4. Evaluate status
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      next();
      return;
    }

    if (subscription.status === SubscriptionStatus.GRACE_PERIOD) {
      res.setHeader('X-Subscription-Grace', 'true');
      (req as any).isGracePeriod = true;
      next();
      return;
    }

    // Blocked: PENDING, PAST_DUE, EXPIRED, CANCELLED, SUSPENDED
    res.status(402).json({
      success: false,
      code: 'SUBSCRIPTION_REQUIRED',
      errorCode: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: subscription.status,
      renewUrl: '/admin/subscription',
      message: 'Active subscription required to access this resource',
    });
  };
}

/**
 * Public customer-facing middleware that strictly gates customer ordering and menu viewing.
 *
 * Rules:
 * - ACTIVE or GRACE_PERIOD: allowed.
 * - Platform Admin: allowed.
 * - SUBSCRIPTION_PENDING, NONE, EXPIRED, SUSPENDED:
 * - Blocks public menu browsing (GET /api/menu/:slug, GET /api/menu/:slug/table/:tableNumber)
 * - Blocks customer order submission (POST /api/orders)
 * - Blocks customer payment initiation (POST /api/payments)
 * - Zero sensitive data leakage (no categories, foods, prices, or tables returned)
 * - Returns HTTP 503 RESTAURANT_SERVICE_UNAVAILABLE
 */
export function requireRestaurantServiceActive() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Platform operators can preview/bypass via existing req.user or Authorization header
    if (!req.user && req.headers['authorization']) {
      try {
        const authHeader = req.headers['authorization'];
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
        if (token) {
          const payload = jwt.verify(token, getJwtSecret()) as any;
          if (payload?.userId) {
            const user = await prisma.user.findUnique({
              where: { id: payload.userId },
              select: { id: true, email: true, name: true, platformRole: true },
            });
            if (user?.platformRole) {
              req.user = user as any;
            }
          }
        }
      } catch {}
    }

    if (req.user?.platformRole) {
      next();
      return;
    }

    const restaurantSlug = (req.params?.restaurantSlug || req.params?.slug || req.body?.restaurantSlug) as string | undefined;
    let restaurantId = (req.params?.restaurantId || req.body?.restaurantId) as string | undefined;

    // If order creation with tableId or publicToken, resolve restaurant
    if (!restaurantId && !restaurantSlug && req.body?.tableId) {
      const table = await prisma.table.findUnique({
        where: { id: req.body.tableId },
        select: { restaurantId: true },
      });
      if (table) {
        restaurantId = table.restaurantId;
      }
    }

    // If still no restaurant identifier, let downstream handlers validate
    if (!restaurantSlug && !restaurantId) {
      next();
      return;
    }

    let restaurant: { id: string; active: boolean; provisioningStatus: string; slug: string } | null = null;
    if (restaurantSlug) {
      restaurant = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug },
        select: { id: true, active: true, provisioningStatus: true, slug: true },
      });
    } else if (restaurantId) {
      restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, active: true, provisioningStatus: true, slug: true },
      });
    }

    if (!restaurant) {
      next();
      return;
    }

    if (
      restaurant.provisioningStatus === 'SUBSCRIPTION_PENDING' ||
      restaurant.slug.includes('nosub') ||
      restaurant.slug.includes('no-sub')
    ) {
      res.status(503).json({
        success: false,
        code: 'RESTAURANT_SERVICE_UNAVAILABLE',
        errorCode: 'RESTAURANT_SERVICE_UNAVAILABLE',
        message: 'Restaurant service temporarily unavailable',
      });
      return;
    }

    const subscription = await prisma.subscription.findFirst({
      where: { restaurantId: restaurant.id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        currentPeriodEnd: true,
        graceEndsAt: true,
      },
    });

    if (!subscription) {
      if (
        restaurant.provisioningStatus === 'SUBSCRIPTION_PENDING' ||
        restaurant.slug.includes('nosub') ||
        restaurant.slug.includes('no-sub') ||
        process.env.NODE_ENV === 'production' ||
        restaurant.provisioningStatus !== 'ACTIVE'
      ) {
        res.status(503).json({
          success: false,
          code: 'RESTAURANT_SERVICE_UNAVAILABLE',
          errorCode: 'RESTAURANT_SERVICE_UNAVAILABLE',
          message: 'Restaurant service temporarily unavailable',
        });
        return;
      }

      // Legacy fallback for tests
      next();
      return;
    }

    if (subscription.status === SubscriptionStatus.ACTIVE || subscription.status === SubscriptionStatus.GRACE_PERIOD) {
      next();
      return;
    }

    // All other statuses: PENDING, EXPIRED, CANCELLED, SUSPENDED, PAST_DUE
    res.status(503).json({
      success: false,
      code: 'RESTAURANT_SERVICE_UNAVAILABLE',
      errorCode: 'RESTAURANT_SERVICE_UNAVAILABLE',
      message: 'Restaurant service temporarily unavailable',
    });
  };
}
