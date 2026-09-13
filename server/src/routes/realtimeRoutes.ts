import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../prisma';
import { realtimeService } from '../services/realtimeService';
import { getJwtSecret } from '../config';

export const realtimeRouter = Router();

/**
 * GET /api/restaurants/:restaurantId/events
 * GET /api/restaurants/:restaurantId/orders/stream
 * Real-time SSE endpoint for Restaurant Staff, Orders Studio, Kitchen KDS & Notifications.
 * Supports token via query param `?token=` (standard EventSource) or Bearer header.
 */
const handleRestaurantStream = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;

      // Extract token from query or Authorization header
      const queryToken = req.query.token as string | undefined;
      const authHeader = req.headers['authorization'];
      const bearerToken =
        authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

      const token = queryToken || bearerToken;

      if (!token) {
        res.status(401).json({
          success: false,
          errorCode: 'AUTH_REQUIRED',
          message: 'Authentication token required to subscribe to restaurant events.',
        });
        return;
      }

      let userId: string;
      try {
        const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
        userId = payload.userId;
      } catch {
        res.status(401).json({
          success: false,
          errorCode: 'INVALID_TOKEN',
          message: 'Invalid or expired authentication token.',
        });
        return;
      }

      // Check if user is active and whether they are a platform admin
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, active: true, platformRole: true },
      });

      if (!user || !user.active) {
        res.status(401).json({
          success: false,
          errorCode: 'INVALID_TOKEN',
          message: 'User account not found or deactivated.',
        });
        return;
      }

      // Platform Admins have tenant-wide observation access
      if (user.platformRole !== 'PLATFORM_ADMIN') {
        // Verify user membership in this restaurant
        const membership = await prisma.userRestaurant.findUnique({
          where: {
            userId_restaurantId: {
              userId,
              restaurantId,
            },
          },
        });

        if (!membership) {
          res.status(403).json({
            success: false,
            errorCode: 'RESTAURANT_ACCESS_DENIED',
            message: 'You are not assigned to this restaurant tenant.',
          });
          return;
        }

        if (membership.status === 'DISABLED') {
          res.status(403).json({
            success: false,
            errorCode: 'STAFF_DISABLED',
            message: 'Your access to this restaurant has been disabled by management.',
          });
          return;
        }
      }

      // Connect client to restaurant channel
      realtimeService.subscribe(`restaurant:${restaurantId}`, res);
    } catch (err) {
      next(err);
  }
};

realtimeRouter.get('/restaurants/:restaurantId/events', handleRestaurantStream);
realtimeRouter.get('/restaurants/:restaurantId/orders/stream', handleRestaurantStream);

/**
 * GET /api/orders/track/:publicOrderToken/events
 * Real-time SSE endpoint for Customer Order Tracking.
 * Publicly accessible using the order's unique publicToken.
 */
realtimeRouter.get(
  '/orders/track/:publicOrderToken/events',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicOrderToken } = req.params;

      const order = await prisma.order.findUnique({
        where: { publicToken: publicOrderToken },
        select: { id: true, status: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          errorCode: 'ORDER_NOT_FOUND',
          message: 'Order tracking token is invalid.',
        });
        return;
      }

      // Connect client to customer order channel
      realtimeService.subscribe(`order:${publicOrderToken}`, res);
    } catch (err) {
      next(err);
    }
  }
);
