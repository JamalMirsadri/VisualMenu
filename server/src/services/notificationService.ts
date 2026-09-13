import {
  AuditAction,
  NotificationPriority,
  NotificationSeverity,
  NotificationSource,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../prisma';
import { realtimeService } from './realtimeService';
import { AuditService } from './auditService';

export interface CreateNotificationInput {
  restaurantId: string;
  userId?: string | null;
  type?: NotificationType;
  source?: NotificationSource;
  priority?: NotificationPriority;
  title: string;
  message: string;
  severity?: NotificationSeverity;
  expiresAt?: Date | null;
  pinned?: boolean;
  createdByUserId?: string | null;
  platformMessageId?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface ListNotificationOptions {
  page?: number;
  limit?: number;
  type?: NotificationType;
  source?: NotificationSource;
  priority?: NotificationPriority;
  unreadOnly?: boolean;
  pinnedOnly?: boolean;
  unacknowledgedOnly?: boolean;
  search?: string;
  includeExpired?: boolean;
}

export class NotificationService {
  /**
   * Create a tenant-scoped notification and broadcast via SSE
   */
  static async createNotification(input: CreateNotificationInput) {
    const type = input.type || NotificationType.GENERAL_ANNOUNCEMENT;

    // Auto-detect source if not explicitly provided
    let source = input.source;
    if (!source) {
      if (type && type.startsWith('SUBSCRIPTION_')) {
        source = NotificationSource.SUBSCRIPTION;
      } else if (input.platformMessageId) {
        source = NotificationSource.PLATFORM;
      } else {
        source = NotificationSource.SYSTEM;
      }
    }

    // Auto-detect priority if not explicitly provided
    let priority = input.priority;
    if (!priority) {
      if (input.severity === NotificationSeverity.CRITICAL) {
        priority = NotificationPriority.URGENT;
      } else if (input.severity === NotificationSeverity.WARNING) {
        priority = NotificationPriority.HIGH;
      } else {
        priority = NotificationPriority.NORMAL;
      }
    }

    const notification = await prisma.notification.create({
      data: {
        restaurantId: input.restaurantId,
        userId: input.userId || null,
        type,
        source,
        priority,
        title: input.title,
        message: input.message,
        severity: input.severity || NotificationSeverity.INFO,
        pinned: input.pinned ?? false,
        expiresAt: input.expiresAt || null,
        createdByUserId: input.createdByUserId || null,
        platformMessageId: input.platformMessageId || null,
        metadata: input.metadata || Prisma.JsonNull,
      },
    });

    try {
      const payload = {
        id: notification.id,
        restaurantId: notification.restaurantId,
        type: notification.type,
        source: notification.source,
        priority: notification.priority,
        title: notification.title,
        message: notification.message,
        severity: notification.severity,
        pinned: notification.pinned,
        expiresAt: notification.expiresAt?.toISOString() || null,
        createdAt: notification.createdAt.toISOString(),
      };

      realtimeService.broadcastToRestaurant(input.restaurantId, 'notification_created' as any, payload);
      realtimeService.broadcastToRestaurant(input.restaurantId, 'notification' as any, payload);
      realtimeService.broadcastToRestaurant(input.restaurantId, 'platform_message' as any, payload);
    } catch {
      // Non-blocking realtime broadcast
    }

    return notification;
  }

  /**
   * Get paginated notifications for a restaurant (and optionally specific user)
   */
  static async getNotifications(
    restaurantId: string,
    userId?: string,
    options: ListNotificationOptions = {}
  ) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const now = new Date();

    const andConditions: Prisma.NotificationWhereInput[] = [
      { restaurantId },
      { archivedAt: null },
    ];

    if (userId) {
      andConditions.push({
        OR: [{ userId: null }, { userId }],
      });
    }

    if (options.type) {
      andConditions.push({ type: options.type });
    }

    if (options.source) {
      andConditions.push({ source: options.source });
    }

    if (options.priority) {
      andConditions.push({ priority: options.priority });
    }

    if (options.unreadOnly) {
      andConditions.push({ readAt: null });
    }

    if (options.pinnedOnly) {
      andConditions.push({ pinned: true });
    }

    if (options.unacknowledgedOnly) {
      andConditions.push({ acknowledgedAt: null });
    }

    if (!options.includeExpired) {
      andConditions.push({
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      });
    }

    if (options.search && options.search.trim()) {
      andConditions.push({
        OR: [
          { title: { contains: options.search.trim(), mode: 'insensitive' } },
          { message: { contains: options.search.trim(), mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.NotificationWhereInput = {
      AND: andConditions,
    };

    const [total, items] = await Promise.all([
      prisma.notification.count({ where }),
      prisma.notification.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          restaurantId: true,
          userId: true,
          type: true,
          source: true,
          priority: true,
          title: true,
          message: true,
          severity: true,
          pinned: true,
          readAt: true,
          acknowledgedAt: true,
          acknowledgedByUserId: true,
          expiresAt: true,
          metadata: true,
          createdAt: true,
          platformMessageId: true,
        },
      }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get count of unread notifications for a restaurant
   */
  static async getUnreadCount(restaurantId: string, userId?: string): Promise<number> {
    const now = new Date();
    const andConditions: Prisma.NotificationWhereInput[] = [
      { restaurantId },
      { readAt: null },
      { archivedAt: null },
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    ];

    if (userId) {
      andConditions.push({
        OR: [{ userId: null }, { userId }],
      });
    }

    return await prisma.notification.count({
      where: { AND: andConditions },
    });
  }

  /**
   * Mark a single notification as read (with strict tenant verification)
   */
  static async markRead(notificationId: string, restaurantId: string, userId?: string) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        restaurantId,
      },
    });

    if (!notification) {
      throw new Error('NOTIFICATION_NOT_FOUND');
    }

    const readDate = new Date();

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: readDate },
    });

    // If linked to a platform message, update the recipient status
    if (notification.platformMessageId) {
      await prisma.platformMessageRecipient.updateMany({
        where: {
          messageId: notification.platformMessageId,
          restaurantId,
          readAt: null,
        },
        data: { readAt: readDate },
      });
    }

    await AuditService.log({
      restaurantId,
      userId: userId || null,
      action: AuditAction.NOTIFICATION_READ,
      entityType: 'Notification',
      entityId: notificationId,
      metadata: { title: notification.title, priority: notification.priority },
    });

    return updated;
  }

  /**
   * Mark a single notification as unread
   */
  static async markUnread(notificationId: string, restaurantId: string, userId?: string) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        restaurantId,
      },
    });

    if (!notification) {
      throw new Error('NOTIFICATION_NOT_FOUND');
    }

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: null },
    });

    if (notification.platformMessageId) {
      await prisma.platformMessageRecipient.updateMany({
        where: {
          messageId: notification.platformMessageId,
          restaurantId,
        },
        data: { readAt: null },
      });
    }

    return updated;
  }

  /**
   * Acknowledge a high/urgent notification
   */
  static async acknowledgeNotification(notificationId: string, restaurantId: string, userId?: string) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        restaurantId,
      },
    });

    if (!notification) {
      throw new Error('NOTIFICATION_NOT_FOUND');
    }

    const now = new Date();

    const updated = await prisma.notification.update({
      where: { id: notificationId },
      data: {
        acknowledgedAt: now,
        acknowledgedByUserId: userId || null,
        readAt: notification.readAt || now, // Acknowledging also marks as read
      },
    });

    // If linked to platform message recipient, record acknowledgedAt, acknowledgedByUserId and readAt
    if (notification.platformMessageId) {
      await prisma.platformMessageRecipient.updateMany({
        where: {
          messageId: notification.platformMessageId,
          restaurantId,
        },
        data: {
          acknowledgedAt: now,
          acknowledgedByUserId: userId || null,
          readAt: now,
        },
      });
    }

    await AuditService.log({
      restaurantId,
      userId: userId || null,
      action: AuditAction.NOTIFICATION_ACKNOWLEDGED,
      entityType: 'Notification',
      entityId: notificationId,
      metadata: {
        title: notification.title,
        priority: notification.priority,
        acknowledgedAt: now.toISOString(),
      },
    });

    return updated;
  }

  /**
   * Mark all unread notifications as read for a restaurant
   */
  static async markAllRead(restaurantId: string, userId?: string) {
    const now = new Date();
    const where: Prisma.NotificationWhereInput = {
      restaurantId,
      readAt: null,
      archivedAt: null,
      ...(userId
        ? {
            OR: [{ userId: null }, { userId }],
          }
        : {}),
    };

    const notificationsToUpdate = await prisma.notification.findMany({
      where,
      select: { id: true, platformMessageId: true },
    });

    const result = await prisma.notification.updateMany({
      where,
      data: { readAt: now },
    });

    // Update any linked platform message recipient records
    const platformMessageIds = notificationsToUpdate
      .map((n) => n.platformMessageId)
      .filter((id): id is string => Boolean(id));

    if (platformMessageIds.length > 0) {
      await prisma.platformMessageRecipient.updateMany({
        where: {
          messageId: { in: platformMessageIds },
          restaurantId,
          readAt: null,
        },
        data: { readAt: now },
      });
    }

    return { count: result.count };
  }
}
