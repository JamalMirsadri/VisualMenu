import {
  AuditAction,
  NotificationPriority,
  NotificationSeverity,
  NotificationSource,
  NotificationType,
  PlatformMessageStatus,
  PlatformMessageTargetType,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from './auditService';
import { realtimeService } from './realtimeService';

export interface CreatePlatformMessageInput {
  title: string;
  message?: string;
  body?: string;
  priority?: NotificationPriority;
  targetType: PlatformMessageTargetType;
  restaurantIds?: string[];
  targetRestaurantIds?: string[];
  subscriptionStatusFilter?: SubscriptionStatus[];
  filterStatus?: SubscriptionStatus[];
  restaurantActiveFilter?: boolean;
  filterActiveOnly?: boolean;
  scheduledAt?: Date | string | null;
  expiresAt?: Date | string | null;
  pinned?: boolean;
  requiresAcknowledgement?: boolean;
  metadata?: Prisma.InputJsonValue;
  confirmed?: boolean;
  confirmAll?: boolean;
  isDraft?: boolean;
}

export interface ListPlatformMessagesOptions {
  page?: number;
  limit?: number;
  status?: PlatformMessageStatus;
  targetType?: PlatformMessageTargetType;
  priority?: NotificationPriority;
  search?: string;
}

export class PlatformMessageService {
  /**
   * Compose and optionally send or schedule a platform message
   */
  static async createMessage(
    input: CreatePlatformMessageInput,
    actorUser?: { id: string; email?: string; name?: string } | string
  ) {
    const title = (input.title || '').trim();
    const content = (input.message || input.body || '').trim();

    if (!title) {
      throw new Error('Message title is required');
    }
    if (!content) {
      throw new Error('Message content is required');
    }

    const actorUserId = typeof actorUser === 'string' ? actorUser : actorUser?.id;
    const priority = input.priority || NotificationPriority.NORMAL;
    const targetType = input.targetType;
    let scheduledDate: Date | null = null;

    if (input.scheduledAt) {
      const d = new Date(input.scheduledAt);
      if (!isNaN(d.getTime()) && d.getTime() > Date.now()) {
        scheduledDate = d;
      }
    }

    const expiresDate = input.expiresAt ? new Date(input.expiresAt) : null;
    const isConfirmed = Boolean(input.confirmed || input.confirmAll);
    const targetRestaurantIds = input.restaurantIds || input.targetRestaurantIds || [];
    const statusFilter = input.subscriptionStatusFilter || input.filterStatus;
    const activeFilter = input.restaurantActiveFilter !== undefined ? input.restaurantActiveFilter : input.filterActiveOnly;

    // Resolve targeted restaurant IDs
    const resolvedRestaurantIds = await this.resolveTargetRestaurants({
      targetType,
      restaurantIds: targetRestaurantIds,
      subscriptionStatusFilter: statusFilter,
      restaurantActiveFilter: activeFilter,
    });

    if (!input.isDraft && resolvedRestaurantIds.length === 0) {
      throw new Error('No recipient restaurants matched the targeting criteria');
    }

    // Explicit confirmation safety check for broadcast to ALL_RESTAURANTS
    if (!input.isDraft && targetType === PlatformMessageTargetType.ALL_RESTAURANTS && !isConfirmed) {
      throw new Error('CONFIRMATION_REQUIRED: Sending to all restaurants requires explicit confirmation');
    }

    const status = input.isDraft
      ? PlatformMessageStatus.DRAFT
      : scheduledDate
      ? PlatformMessageStatus.SCHEDULED
      : PlatformMessageStatus.SENT;

    const metadataPayload = {
      ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
      targetRestaurantIds,
      subscriptionStatusFilter: statusFilter,
      restaurantActiveFilter: activeFilter,
      pinned: Boolean(input.pinned),
      requiresAcknowledgement: Boolean(input.requiresAcknowledgement),
    };

    const message = await prisma.platformMessage.create({
      data: {
        senderUserId: actorUserId,
        title,
        message: content,
        priority,
        targetType,
        status,
        scheduledAt: scheduledDate,
        expiresAt: expiresDate,
        sentAt: status === PlatformMessageStatus.SENT ? new Date() : null,
        metadata: metadataPayload,
      },
    });

    // If immediate send, dispatch recipient records and tenant notifications
    if (status === PlatformMessageStatus.SENT) {
      await this.dispatchMessageDelivery(message.id, resolvedRestaurantIds, actorUser);
    }

    if (actorUserId) {
      await AuditService.log({
        userId: actorUserId,
        action: input.isDraft
          ? AuditAction.PLATFORM_MESSAGE_CREATED
          : scheduledDate
          ? AuditAction.PLATFORM_MESSAGE_SCHEDULED
          : AuditAction.PLATFORM_MESSAGE_SENT,
        entityType: 'PlatformMessage',
        entityId: message.id,
        metadata: {
          title: message.title,
          targetType: message.targetType,
          recipientCount: resolvedRestaurantIds.length,
          status: message.status,
          isScheduled: Boolean(scheduledDate),
          isDraft: Boolean(input.isDraft),
        },
      });
    }

    return message;
  }

  /**
   * Helper: Resolves matching restaurant IDs based on targetType and filters
   */
  static async resolveTargetRestaurants(options: {
    targetType: PlatformMessageTargetType;
    restaurantIds?: string[];
    subscriptionStatusFilter?: SubscriptionStatus[];
    restaurantActiveFilter?: boolean;
  }): Promise<string[]> {
    const { targetType, restaurantIds, subscriptionStatusFilter, restaurantActiveFilter } = options;

    if (targetType === PlatformMessageTargetType.RESTAURANT) {
      if (!restaurantIds || restaurantIds.length === 0) {
        throw new Error('A target restaurant must be selected');
      }
      return [restaurantIds[0]];
    }

    if (targetType === PlatformMessageTargetType.MULTIPLE_RESTAURANTS) {
      if (!restaurantIds || restaurantIds.length === 0) {
        throw new Error('At least one restaurant must be selected for multiple restaurant targeting');
      }
      return Array.from(new Set(restaurantIds));
    }

    // ALL_RESTAURANTS with optional filters
    const where: Prisma.RestaurantWhereInput = {};

    if (restaurantActiveFilter !== undefined) {
      where.active = restaurantActiveFilter;
    }

    if (subscriptionStatusFilter && subscriptionStatusFilter.length > 0) {
      where.subscriptions = {
        some: {
          status: { in: subscriptionStatusFilter },
        },
      };
    }

    const matched = await prisma.restaurant.findMany({
      where,
      select: { id: true },
    });

    return matched.map((r) => r.id);
  }

  /**
   * Internal worker method: Dispatches message delivery to resolved restaurants
   */
  private static async dispatchMessageDelivery(
    messageId: string,
    restaurantIds: string[],
    actorUser?: { id: string }
  ) {
    const message = await prisma.platformMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) return;

    const now = new Date();
    const severity: NotificationSeverity =
      message.priority === NotificationPriority.URGENT
        ? NotificationSeverity.CRITICAL
        : message.priority === NotificationPriority.HIGH
        ? NotificationSeverity.WARNING
        : NotificationSeverity.INFO;

    const uniqueRestaurantIds = Array.from(new Set(restaurantIds));

    // Batch insert recipients and tenant notifications transactionally
    for (const restaurantId of uniqueRestaurantIds) {
      try {
        // Upsert recipient row to guarantee exactly 1 recipient row
        const recipient = await prisma.platformMessageRecipient.upsert({
          where: {
            messageId_restaurantId: {
              messageId: message.id,
              restaurantId,
            },
          },
          update: {
            deliveredAt: now,
          },
          create: {
            messageId: message.id,
            restaurantId,
            deliveredAt: now,
          },
        });

        // Create tenant notification
        const notification = await prisma.notification.create({
          data: {
            restaurantId,
            type: NotificationType.PLATFORM_MESSAGE,
            source: NotificationSource.PLATFORM,
            priority: message.priority,
            title: message.title,
            message: message.message,
            severity,
            pinned: message.priority === NotificationPriority.URGENT,
            expiresAt: message.expiresAt,
            platformMessageId: message.id,
            createdByUserId: actorUser?.id || message.senderUserId,
          },
        });

        // Emit real-time SSE event to restaurant channel
        try {
          realtimeService.broadcastToRestaurant(restaurantId, 'notification_created' as any, {
            id: notification.id,
            restaurantId,
            type: notification.type,
            source: notification.source,
            priority: notification.priority,
            title: notification.title,
            message: notification.message,
            severity: notification.severity,
            pinned: notification.pinned,
            expiresAt: notification.expiresAt?.toISOString() || null,
            createdAt: notification.createdAt.toISOString(),
          });
        } catch {
          // Realtime notification failure is non-blocking
        }
      } catch (err) {
        console.error(`Error delivering platform message to restaurant ${restaurantId}:`, err);
      }
    }

    // Update message status to SENT
    await prisma.platformMessage.update({
      where: { id: messageId },
      data: {
        status: PlatformMessageStatus.SENT,
        sentAt: now,
      },
    });

    await AuditService.log({
      userId: actorUser?.id || message.senderUserId || null,
      action: AuditAction.PLATFORM_MESSAGE_SENT,
      entityType: 'PlatformMessage',
      entityId: message.id,
      metadata: {
        title: message.title,
        priority: message.priority,
        deliveredCount: uniqueRestaurantIds.length,
      },
    });
  }

  /**
   * Periodic scheduler worker: Publishes scheduled messages whose time has arrived
   */
  static async processScheduledMessages(): Promise<number> {
    const now = new Date();

    // Atomically find scheduled messages ready for publishing
    const scheduled = await prisma.platformMessage.findMany({
      where: {
        status: PlatformMessageStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
    });

    let publishedCount = 0;

    for (const msg of scheduled) {
      // Optimistic concurrency lock: transition from SCHEDULED to SENDING
      const claimed = await prisma.platformMessage.updateMany({
        where: {
          id: msg.id,
          status: PlatformMessageStatus.SCHEDULED,
        },
        data: {
          status: PlatformMessageStatus.SENDING,
        },
      });

      if (claimed.count === 0) {
        // Another worker thread/process claimed it
        continue;
      }

      // Re-resolve target restaurants
      const meta = (msg.metadata as any) || {};
      const restaurantIds = await this.resolveTargetRestaurants({
        targetType: msg.targetType,
        restaurantIds: meta.targetRestaurantIds || meta.restaurantIds,
        subscriptionStatusFilter: meta.subscriptionStatusFilter,
        restaurantActiveFilter: meta.restaurantActiveFilter,
      });

      await this.dispatchMessageDelivery(msg.id, restaurantIds, { id: msg.senderUserId || '' });
      publishedCount++;
    }

    return publishedCount;
  }

  /**
   * Cancel a scheduled message
   */
  static async cancelScheduledMessage(messageId: string, actorUser?: { id: string } | string) {
    const actorUserId = typeof actorUser === 'string' ? actorUser : actorUser?.id;
    const message = await prisma.platformMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    if (message.status !== PlatformMessageStatus.SCHEDULED && message.status !== PlatformMessageStatus.DRAFT) {
      throw new Error('Only scheduled or draft messages can be cancelled');
    }

    const updated = await prisma.platformMessage.update({
      where: { id: messageId },
      data: { status: PlatformMessageStatus.CANCELLED },
    });

    if (actorUserId) {
      await AuditService.log({
        userId: actorUserId,
        action: AuditAction.PLATFORM_MESSAGE_CANCELLED,
        entityType: 'PlatformMessage',
        entityId: messageId,
        metadata: { title: message.title, previousStatus: message.status },
      });
    }

    return updated;
  }

  /**
   * Edit a draft or create a revision if already sent
   */
  static async editMessage(
    messageId: string,
    arg2?: any,
    arg3?: any
  ) {
    let input: { title?: string; message?: string; body?: string };
    let actorUserId: string | undefined;

    if (typeof arg2 === 'string' || (arg2 && arg2.id && !arg2.title && !arg2.message && !arg2.body)) {
      actorUserId = typeof arg2 === 'string' ? arg2 : arg2.id;
      input = arg3 || {};
    } else {
      input = arg2 || {};
      actorUserId = typeof arg3 === 'string' ? arg3 : arg3?.id;
    }

    const existing = await prisma.platformMessage.findUnique({
      where: { id: messageId },
    });

    if (!existing) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    const newTitle = input.title?.trim() || existing.title;
    const newContent = input.message?.trim() || input.body?.trim() || existing.message;

    if (existing.status === PlatformMessageStatus.DRAFT) {
      // Direct update for draft
      return await prisma.platformMessage.update({
        where: { id: messageId },
        data: {
          title: newTitle,
          message: newContent,
        },
      });
    }

    // If message is already SENT, store an immutable revision history and update linked notifications
    await prisma.$transaction(async (tx) => {
      await tx.platformMessageRevision.create({
        data: {
          messageId: existing.id,
          title: existing.title,
          content: existing.message,
          editedByUserId: actorUserId || null,
        },
      });

      await tx.platformMessage.update({
        where: { id: messageId },
        data: {
          title: newTitle,
          message: newContent,
        },
      });

      await tx.notification.updateMany({
        where: { platformMessageId: messageId },
        data: {
          title: newTitle,
          message: newContent,
        },
      });
    });

    if (actorUserId) {
      await AuditService.log({
        userId: actorUserId,
        action: AuditAction.PLATFORM_MESSAGE_EDITED,
        entityType: 'PlatformMessage',
        entityId: messageId,
        metadata: { newTitle, previousTitle: existing.title },
      });
    }

    return await this.getMessageDetails(messageId);
  }

  /**
   * List platform messages with pagination and delivery metrics
   */
  static async getPlatformMessages(options: ListPlatformMessagesOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.PlatformMessageWhereInput = {
      ...(options.status ? { status: options.status } : {}),
      ...(options.priority ? { priority: options.priority } : {}),
      ...(options.search
        ? {
            OR: [
              { title: { contains: options.search, mode: 'insensitive' } },
              { message: { contains: options.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, messages] = await Promise.all([
      prisma.platformMessage.count({ where }),
      prisma.platformMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          senderUser: {
            select: { id: true, name: true, email: true },
          },
          _count: {
            select: { recipients: true, revisions: true },
          },
          recipients: {
            select: {
              readAt: true,
              acknowledgedAt: true,
              deliveredAt: true,
            },
          },
        },
      }),
    ]);

    const formatted = messages.map((msg) => {
      const recipientCount = msg.recipients.length;
      const readCount = msg.recipients.filter((r) => r.readAt !== null).length;
      const acknowledgedCount = msg.recipients.filter((r) => r.acknowledgedAt !== null).length;
      const deliveredCount = msg.recipients.filter((r) => r.deliveredAt !== null).length;

      const readRate = recipientCount > 0 ? Math.round((readCount / recipientCount) * 100) : 0;
      const acknowledgedRate = recipientCount > 0 ? Math.round((acknowledgedCount / recipientCount) * 100) : 0;

      // Omit detailed recipient rows from the list payload
      const { recipients, ...rest } = msg;

      return {
        ...rest,
        stats: {
          recipientCount,
          deliveredCount,
          readCount,
          acknowledgedCount,
          readRate,
          acknowledgedRate,
        },
      };
    });

    return {
      items: formatted,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single platform message with full recipient status breakdown
   */
  static async getMessageDetails(messageId: string) {
    const message = await prisma.platformMessage.findUnique({
      where: { id: messageId },
      include: {
        senderUser: {
          select: { id: true, name: true, email: true },
        },
        revisions: {
          include: {
            editedByUser: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        recipients: {
          include: {
            restaurant: {
              select: { id: true, name: true, slug: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!message) {
      throw new Error('MESSAGE_NOT_FOUND');
    }

    const recipientCount = message.recipients.length;
    const readCount = message.recipients.filter((r) => r.readAt !== null).length;
    const acknowledgedCount = message.recipients.filter((r) => r.acknowledgedAt !== null).length;
    const deliveredCount = message.recipients.filter((r) => r.deliveredAt !== null).length;

    const readRate = recipientCount > 0 ? Math.round((readCount / recipientCount) * 100) : 0;
    const acknowledgedRate = recipientCount > 0 ? Math.round((acknowledgedCount / recipientCount) * 100) : 0;

    return {
      ...message,
      stats: {
        recipientCount,
        deliveredCount,
        readCount,
        acknowledgedCount,
        readRate,
        acknowledgedRate,
      },
    };
  }
}
