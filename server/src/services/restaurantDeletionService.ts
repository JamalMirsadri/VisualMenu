import { AuditAction, PlatformRole } from '@prisma/client';
import { prisma } from '../prisma';
import { getStorageProvider } from './storageProvider';
import { extractStorageKey } from '../config';
import { AuditService } from './auditService';

/**
 * Permanent, transactional, idempotent deletion of a restaurant tenant and all
 * of its dependent records. No soft-delete: every tenant-scoped row is removed
 * in dependency order so the operation never leaves orphans.
 */
export class RestaurantDeletionService {
  static async hardDelete(
    restaurantId: string,
    actorUserId?: string,
    actorPlatformRole?: PlatformRole
  ): Promise<{ id: string; name: string; slug: string }> {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true, logo: true, coverImage: true, favicon: true },
    });

    if (!restaurant) {
      const err: any = new Error('Restaurant not found.');
      err.statusCode = 404;
      err.errorCode = 'RESTAURANT_NOT_FOUND';
      throw err;
    }

    // Collect local media URLs before deletion so we can clean up storage files
    // afterwards (only after the DB deletion has committed successfully).
    const media = await prisma.media.findMany({
      where: { restaurantId },
      select: { url: true, thumbnailUrl: true, desktopUrl: true, mobileUrl: true, posterUrl: true },
    });

    await prisma.$transaction(async (tx) => {
      // Order items & order history (Order children)
      await tx.orderItem.deleteMany({ where: { order: { restaurantId } } });
      await tx.orderStatusHistory.deleteMany({ where: { order: { restaurantId } } });

      // Fiscal documents & payments (Order/Payment children + Restaurant children)
      await tx.fiscalDocument.deleteMany({ where: { restaurantId } });
      await tx.paymentTransaction.deleteMany({ where: { payment: { restaurantId } } });
      await tx.payment.deleteMany({ where: { restaurantId } });
      await tx.order.deleteMany({ where: { restaurantId } });

      // Menu catalog
      await tx.foodItem.deleteMany({ where: { restaurantId } });
      await tx.media.deleteMany({ where: { restaurantId } });
      await tx.category.deleteMany({ where: { restaurantId } });

      // AI Food Video Studio
      await tx.videoGenerationJob.deleteMany({ where: { restaurantId } });
      await tx.videoCreditLedger.deleteMany({ where: { restaurantId } });
      await tx.videoCreditPurchase.deleteMany({ where: { restaurantId } });

      // Tables & QR
      await tx.qrCode.deleteMany({ where: { restaurantId } });
      await tx.table.deleteMany({ where: { restaurantId } });

      // Settings
      await tx.restaurantSettings.deleteMany({ where: { restaurantId } });

      // Customers & fiscal profiles
      await tx.customerFiscalProfile.deleteMany({ where: { customer: { restaurantId } } });
      await tx.customer.deleteMany({ where: { restaurantId } });

      // Memberships & permissions
      await tx.userRestaurantPermission.deleteMany({ where: { userRestaurant: { restaurantId } } });
      await tx.userRestaurant.deleteMany({ where: { restaurantId } });

      // Invitations
      await tx.staffInvitation.deleteMany({ where: { restaurantId } });
      await tx.ownerInvitation.deleteMany({ where: { restaurantId } });

      // Subscription / billing
      await tx.subscriptionPayment.deleteMany({ where: { subscription: { restaurantId } } });
      await tx.subscriptionInvoice.deleteMany({ where: { subscription: { restaurantId } } });
      await tx.subscriptionEvent.deleteMany({ where: { subscription: { restaurantId } } });
      await tx.subscriptionReminderLog.deleteMany({ where: { subscription: { restaurantId } } });
      await tx.subscriptionRequest.deleteMany({ where: { restaurantId } });
      await tx.subscription.deleteMany({ where: { restaurantId } });

      // Notifications & platform message recipients
      await tx.notification.deleteMany({ where: { restaurantId } });
      await tx.platformMessageRecipient.deleteMany({ where: { restaurantId } });

      // Audit trail for this tenant
      await tx.auditLog.deleteMany({ where: { restaurantId } });

      // Finally the restaurant itself (cascades any remaining tenant rows)
      await tx.restaurant.delete({ where: { id: restaurantId } });
    });

    // Clean up local storage files (best-effort, after successful DB deletion).
    const keys = new Set<string>();
    for (const m of media) {
      for (const url of [m.url, m.thumbnailUrl, m.desktopUrl, m.mobileUrl, m.posterUrl]) {
        const key = extractStorageKey(url);
        if (key) keys.add(key);
      }
    }
    for (const url of [restaurant.logo, restaurant.coverImage, restaurant.favicon]) {
      const key = extractStorageKey(url);
      if (key) keys.add(key);
    }

    const storage = getStorageProvider();
    for (const key of keys) {
      await storage.delete(key).catch(() => {});
    }

    // Record the permanent deletion without a restaurantId (tenant is gone).
    await AuditService.log({
      userId: actorUserId,
      action: AuditAction.DELETE,
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: {
        actorPlatformRole,
        name: restaurant.name,
        slug: restaurant.slug,
        permanent: true,
      },
    });

    return { id: restaurant.id, name: restaurant.name, slug: restaurant.slug };
  }
}
