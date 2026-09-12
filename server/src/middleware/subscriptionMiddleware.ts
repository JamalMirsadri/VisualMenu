import { NextFunction, Request, Response } from 'express';
import { SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prisma';

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
 * - PENDING, PAST_DUE, EXPIRED, CANCELLED, SUSPENDED: blocked with HTTP 402.
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
      // Safe migration/initialization strategy for existing / unseeded restaurants from Phases 1-12:
      // If the restaurant exists in the database, provision an active migration subscription so existing features do not break.
      const restaurantExists = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, provisioningStatus: true },
      });

      if (!restaurantExists) {
        // If restaurant does not exist at all, let downstream route handlers return 404
        next();
        return;
      }

      // If restaurant was explicitly provisioned as SUBSCRIPTION_PENDING, enforce 402
      if (restaurantExists.provisioningStatus === 'SUBSCRIPTION_PENDING') {
        res.status(402).json({
          success: false,
          errorCode: 'SUBSCRIPTION_REQUIRED',
          subscriptionStatus: 'PENDING',
          renewUrl: '/admin/subscription',
          message: 'Initial subscription payment required.',
        });
        return;
      }

      const defaultPlan = await prisma.subscriptionPlan.findFirst({
        where: { active: true },
        orderBy: { price: 'asc' },
      });

      if (defaultPlan) {
        const now = new Date();
        const periodEnd = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
        try {
          await prisma.subscription.create({
            data: {
              restaurantId,
              planId: defaultPlan.id,
              status: SubscriptionStatus.ACTIVE,
              startsAt: now,
              currentPeriodStart: now,
              currentPeriodEnd: periodEnd,
              autoRenew: true,
              provider: 'MIGRATION',
              agreedPrice: defaultPlan.price,
              agreedCurrency: defaultPlan.currency,
            },
          });
          next();
          return;
        } catch {
          next();
          return;
        }
      }

      res.status(402).json({
        success: false,
        errorCode: 'SUBSCRIPTION_REQUIRED',
        subscriptionStatus: 'EXPIRED',
        renewUrl: '/admin/subscription',
        message: 'No active subscription found for this restaurant.',
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
      errorCode: 'SUBSCRIPTION_REQUIRED',
      subscriptionStatus: subscription.status,
      renewUrl: '/admin/subscription',
      message: 'Active subscription required to access restaurant administration.',
    });
  };
}
