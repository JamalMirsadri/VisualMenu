import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticateToken, requirePermission, requireRestaurantAccess } from '../middleware/authMiddleware';
import { NotificationService } from '../services/notificationService';
import { NotificationPriority, NotificationSource, NotificationType } from '@prisma/client';

export const notificationRouter = Router();

/**
 * Common handler for retrieving notifications
 */
async function handleGetNotifications(req: Request, res: Response, restaurantId: string) {
  try {
    const {
      page,
      limit,
      type,
      unreadOnly,
      source,
      priority,
      search,
      pinnedOnly,
      unacknowledgedOnly,
    } = req.query;

    const result = await NotificationService.getNotifications(restaurantId, req.user?.id, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      type: type as NotificationType,
      source: source as NotificationSource,
      priority: priority as NotificationPriority,
      unreadOnly: unreadOnly === 'true',
      search: typeof search === 'string' ? search : undefined,
      pinnedOnly: pinnedOnly === 'true',
      unacknowledgedOnly: unacknowledgedOnly === 'true',
    });

    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Common handler for unread count
 */
async function handleGetUnreadCount(req: Request, res: Response, restaurantId: string) {
  try {
    const count = await NotificationService.getUnreadCount(restaurantId, req.user?.id);
    res.json({ success: true, data: { count } });
  } catch (err: any) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Get paginated notifications for a restaurant (path-based)
 */
notificationRouter.get(
  '/restaurant/:restaurantId',
  authenticateToken,
  requirePermission('VIEW_NOTIFICATIONS'),
  async (req: Request, res: Response) => {
    await handleGetNotifications(req, res, req.params.restaurantId);
  }
);

/**
 * Get paginated notifications for a restaurant (query/header based)
 */
notificationRouter.get(
  '/',
  authenticateToken,
  requirePermission('VIEW_NOTIFICATIONS'),
  async (req: Request, res: Response) => {
    const restaurantId = (req.query.restaurantId as string) || (req.headers['x-restaurant-id'] as string) || req.userRestaurantId;
    if (!restaurantId) {
      res.status(400).json({ success: false, error: 'Restaurant context required' });
      return;
    }
    await handleGetNotifications(req, res, restaurantId);
  }
);

/**
 * Get unread notification count for notification bell badge (path-based)
 */
notificationRouter.get(
  '/restaurant/:restaurantId/unread-count',
  authenticateToken,
  requirePermission('VIEW_NOTIFICATIONS'),
  async (req: Request, res: Response) => {
    await handleGetUnreadCount(req, res, req.params.restaurantId);
  }
);

/**
 * Get unread notification count for notification bell badge (query/header based)
 */
notificationRouter.get(
  '/unread-count',
  authenticateToken,
  requirePermission('VIEW_NOTIFICATIONS'),
  async (req: Request, res: Response) => {
    const restaurantId = (req.query.restaurantId as string) || (req.headers['x-restaurant-id'] as string) || req.userRestaurantId;
    if (!restaurantId) {
      res.status(400).json({ success: false, error: 'Restaurant context required' });
      return;
    }
    await handleGetUnreadCount(req, res, restaurantId);
  }
);

/**
 * Mark single notification as read
 */
notificationRouter.post(
  '/:id/read',
  authenticateToken,
  requirePermission('MARK_NOTIFICATIONS_READ'),
  async (req: Request, res: Response) => {
    try {
      const notificationId = req.params.id;
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        res.status(404).json({ success: false, error: 'Notification not found' });
        return;
      }

      const updated = await NotificationService.markRead(notificationId, notification.restaurantId, req.user?.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Mark single notification as unread
 */
notificationRouter.post(
  '/:id/unread',
  authenticateToken,
  requirePermission('MARK_NOTIFICATIONS_READ'),
  async (req: Request, res: Response) => {
    try {
      const notificationId = req.params.id;
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        res.status(404).json({ success: false, error: 'Notification not found' });
        return;
      }

      const updated = await NotificationService.markUnread(notificationId, notification.restaurantId, req.user?.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Acknowledge single notification
 */
notificationRouter.post(
  '/:id/acknowledge',
  authenticateToken,
  requirePermission('ACKNOWLEDGE_NOTIFICATIONS'),
  async (req: Request, res: Response) => {
    try {
      const notificationId = req.params.id;
      const notification = await prisma.notification.findUnique({
        where: { id: notificationId },
      });

      if (!notification) {
        res.status(404).json({ success: false, error: 'Notification not found' });
        return;
      }

      const updated = await NotificationService.acknowledgeNotification(notificationId, notification.restaurantId, req.user!.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Mark all notifications as read for restaurant (path-based)
 */
notificationRouter.post(
  '/restaurant/:restaurantId/read-all',
  authenticateToken,
  requirePermission('MARK_NOTIFICATIONS_READ'),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const result = await NotificationService.markAllRead(restaurantId, req.user?.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Mark all notifications as read for restaurant (body/header based)
 */
notificationRouter.post(
  '/read-all',
  authenticateToken,
  requirePermission('MARK_NOTIFICATIONS_READ'),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = (req.body?.restaurantId as string) || (req.headers['x-restaurant-id'] as string) || req.userRestaurantId;
      if (!restaurantId) {
        res.status(400).json({ success: false, error: 'Restaurant context required' });
        return;
      }
      const result = await NotificationService.markAllRead(restaurantId, req.user?.id);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);
