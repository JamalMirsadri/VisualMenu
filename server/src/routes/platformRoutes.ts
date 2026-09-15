import { Router, Request, Response, NextFunction } from 'express';
import { PlatformRole, AuditAction } from '@prisma/client';
import multer from 'multer';
import { prisma } from '../prisma';
import { PlatformService } from '../services/platformService';
import { RestaurantProvisioningService } from '../services/restaurantProvisioningService';
import { RestaurantDeletionService } from '../services/restaurantDeletionService';
import { SubscriptionService } from '../services/subscription/subscriptionService';
import { PlatformMessageService } from '../services/platformMessageService';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { getStorageProvider } from '../services/storageProvider';
import { sanitizeFeatureKeys } from '../constants/features';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for branding assets
  },
});

export const platformRouter = Router();

// Enforce base platform role on all /api/platform routes
platformRouter.use(requirePlatformRole());

/**
 * GET /api/platform/metrics
 * SaaS cross-tenant aggregate platform metrics
 */
platformRouter.get('/metrics', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const metrics = await PlatformService.getPlatformMetrics();
    res.json({ success: true, data: metrics });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/platform/restaurants
 * Provision a brand new isolated, empty restaurant tenant
 */
platformRouter.post(
  '/restaurants',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RestaurantProvisioningService.provisionRestaurant(
        req.body,
        req.user!.id,
        req.user!.platformRole!,
        req.ip
      );

      res.status(201).json({
        success: true,
        message: `Restaurant "${result.restaurant.name}" provisioned successfully.`,
        data: result,
      });
    } catch (err: any) {
      if (err.code === 'P2002' && (err.meta?.target?.includes('slug') || JSON.stringify(err.meta).includes('slug'))) {
        res.status(409).json({
          success: false,
          errorCode: 'SLUG_CONFLICT',
          message: 'A restaurant with this slug already exists.',
        });
        return;
      }
      if (err.statusCode || err.errorCode) {
        res.status(err.statusCode || 400).json({
          success: false,
          errorCode: err.errorCode || 'PROVISIONING_ERROR',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/platform/restaurants/:id/provisioning
 * Fetch provisioning telemetry and owner invitation status
 */
platformRouter.get(
  '/restaurants/:id/provisioning',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RestaurantProvisioningService.getProvisioningStatus(req.params.id);
      if (!result) {
        res.status(404).json({
          success: false,
          errorCode: 'RESTAURANT_NOT_FOUND',
          message: 'Restaurant not found.',
        });
        return;
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/invitation/resend
 * Resend owner onboarding invitation (revoking active previous invitation)
 */
platformRouter.post(
  '/restaurants/:id/invitation/resend',
  validateUuidParams(['id']),
  requirePlatformRole([PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_SUPPORT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RestaurantProvisioningService.resendOwnerInvitation(
        req.params.id,
        req.user!.id,
        req.user!.platformRole!,
        req.ip
      );

      res.json({
        success: true,
        message: 'Owner invitation resent successfully.',
        data: result,
      });
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/invitation/revoke
 * Revoke active owner onboarding invitation
 */
platformRouter.post(
  '/restaurants/:id/invitation/revoke',
  validateUuidParams(['id']),
  requirePlatformRole([PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_SUPPORT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RestaurantProvisioningService.revokeOwnerInvitation(
        req.params.id,
        req.user!.id,
        req.user!.platformRole!,
        req.ip
      );

      res.json({
        success: true,
        message: 'Owner invitation revoked.',
        data: result,
      });
    } catch (err: any) {
      next(err);
    }
  }
);

/**
 * GET /api/platform/restaurants
 * Server-side paginated and filtered restaurant list
 */
platformRouter.get('/restaurants', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, status, page, limit } = req.query;
    const result = await PlatformService.listRestaurants({
      search: search ? String(search) : undefined,
      status: status === 'active' || status === 'inactive' ? status : 'all',
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/platform/restaurants/:id
 * Restaurant detail overview, user memberships, menu stats, and system status
 */
platformRouter.get(
  '/restaurants/:id',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const details = await PlatformService.getRestaurantDetails(req.params.id);
      if (!details) {
        res.status(404).json({
          success: false,
          errorCode: 'RESTAURANT_NOT_FOUND',
          message: 'Restaurant not found.',
        });
        return;
      }
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/platform/restaurants/:id
 * Edit complete restaurant-level specifications and branding defaults (PLATFORM_ADMIN only)
 */
platformRouter.patch(
  '/restaurants/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await PlatformService.updateRestaurantDetails(
        req.params.id,
        req.body,
        req.user!.id,
        req.user!.platformRole!,
        req.ip
      );

      res.json({
        success: true,
        message: `Restaurant "${result.restaurant.name}" updated successfully.`,
        data: result,
      });
    } catch (err: any) {
      if (err.errorCode === 'SLUG_CONFLICT' || err.statusCode === 409) {
        res.status(409).json({
          success: false,
          errorCode: 'SLUG_CONFLICT',
          message: err.message || 'A restaurant with this slug already exists.',
        });
        return;
      }
      if (err.statusCode || err.errorCode) {
        res.status(err.statusCode || 400).json({
          success: false,
          errorCode: err.errorCode || 'UPDATE_ERROR',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

platformRouter.put(
  '/restaurants/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await PlatformService.updateRestaurantDetails(
        req.params.id,
        req.body,
        req.user!.id,
        req.user!.platformRole!,
        req.ip
      );

      res.json({
        success: true,
        message: `Restaurant "${result.restaurant.name}" updated successfully.`,
        data: result,
      });
    } catch (err: any) {
      if (err.errorCode === 'SLUG_CONFLICT' || err.statusCode === 409) {
        res.status(409).json({
          success: false,
          errorCode: 'SLUG_CONFLICT',
          message: err.message || 'A restaurant with this slug already exists.',
        });
        return;
      }
      if (err.statusCode || err.errorCode) {
        res.status(err.statusCode || 400).json({
          success: false,
          errorCode: err.errorCode || 'UPDATE_ERROR',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/upload
 * Upload restaurant logo or favicon using MediaStorageProvider (PLATFORM_ADMIN only)
 */
platformRouter.post(
  '/restaurants/:id/upload',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      let buffer: Buffer;
      let filename: string;
      let mimeType: string;

      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname;
        mimeType = req.file.mimetype;
      } else {
        const { fileBase64, filename: baseFilename, mimeType: baseMimeType } = req.body;
        if (!fileBase64 || !baseFilename || !baseMimeType) {
          res.status(400).json({
            success: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'A file binary or fileBase64 is required for asset upload.',
          });
          return;
        }
        const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        buffer = Buffer.from(base64Data, 'base64');
        filename = baseFilename;
        mimeType = baseMimeType;
      }

      const storage = getStorageProvider();
      const uploadResult = await storage.upload(
        {
          buffer,
          originalname: filename,
          mimetype: mimeType,
        },
        { folder: `restaurants/${id}/branding` }
      );

      res.status(201).json({
        success: true,
        message: 'Asset uploaded successfully.',
        data: {
          url: uploadResult.url,
          key: uploadResult.key,
          size: uploadResult.size,
          mimeType: uploadResult.mimeType,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/activate
 * Activate a restaurant tenant
 */
platformRouter.post(
  '/restaurants/:id/activate',
  validateUuidParams(['id']),
  requirePlatformRole([PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_SUPPORT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformService.setRestaurantStatus(
        req.params.id,
        true,
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: `Restaurant "${updated.name}" is now ACTIVE.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/deactivate
 * Deactivate a restaurant tenant
 */
platformRouter.post(
  '/restaurants/:id/deactivate',
  validateUuidParams(['id']),
  requirePlatformRole([PlatformRole.PLATFORM_ADMIN, PlatformRole.PLATFORM_SUPPORT]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformService.setRestaurantStatus(
        req.params.id,
        false,
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: `Restaurant "${updated.name}" is now INACTIVE.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/platform/restaurants/:id
 * Permanently delete a restaurant tenant and all of its data (no soft-delete).
 */
platformRouter.delete(
  '/restaurants/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await RestaurantDeletionService.hardDelete(
        req.params.id,
        req.user!.id,
        req.user!.platformRole!
      );

      res.json({
        success: true,
        message: `Restaurant "${result.name}" was permanently deleted.`,
        data: result,
      });
    } catch (err: any) {
      if (err.statusCode || err.errorCode) {
        res.status(err.statusCode || 400).json({
          success: false,
          errorCode: err.errorCode || 'DELETE_FAILED',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/context/enter
 * Audit logging when platform operator enters a restaurant tenant admin context
 */
platformRouter.post(
  '/restaurants/:id/context/enter',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const log = await PlatformService.recordContextSwitch(
        req.user!.id,
        req.user!.platformRole!,
        req.params.id,
        'ENTER',
        req.ip
      );
      res.json({
        success: true,
        message: 'Context switch recorded.',
        data: { auditLogId: log.id },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/context/exit
 * Audit logging when platform operator exits a restaurant tenant admin context
 */
platformRouter.post(
  '/restaurants/:id/context/exit',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const log = await PlatformService.recordContextSwitch(
        req.user!.id,
        req.user!.platformRole!,
        req.params.id,
        'EXIT',
        req.ip
      );
      res.json({
        success: true,
        message: 'Context exit recorded.',
        data: { auditLogId: log.id },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/platform/users
 * Paginated list of platform operators (PLATFORM_ADMIN, PLATFORM_SUPPORT, PLATFORM_VIEWER)
 */
platformRouter.get('/users', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { search, role, page, limit } = req.query;
    const result = await PlatformService.listPlatformUsers({
      search: search ? String(search) : undefined,
      role: role && Object.values(PlatformRole).includes(role as PlatformRole) ? (role as PlatformRole) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 10,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/platform/users
 * Create a new platform operator (requires PLATFORM_ADMIN)
 */
platformRouter.post(
  '/users',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, password, platformRole } = req.body;
      if (!name || !email || !password || !platformRole) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'name, email, password, and platformRole are required.',
        });
        return;
      }

      if (!Object.values(PlatformRole).includes(platformRole)) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_PLATFORM_ROLE',
          message: `Invalid platformRole. Allowed: [${Object.values(PlatformRole).join(', ')}]`,
        });
        return;
      }

      const user = await PlatformService.createPlatformUser({
        name,
        email,
        password,
        platformRole,
        actorUserId: req.user!.id,
        actorPlatformRole: req.user!.platformRole!,
      });

      res.status(201).json({
        success: true,
        message: `Platform user "${user.name}" created with role ${user.platformRole}.`,
        data: user,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/platform/users/:id
 * Update platform operator role or status (requires PLATFORM_ADMIN)
 */
platformRouter.patch(
  '/users/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { platformRole, active, name } = req.body;
      const updated = await PlatformService.updatePlatformUser(
        req.params.id,
        { platformRole, active, name },
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: 'Platform user updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.put(
  '/users/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { platformRole, active, name } = req.body;
      const updated = await PlatformService.updatePlatformUser(
        req.params.id,
        { platformRole, active, name },
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: 'Platform user updated.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/platform/users/:id
 * Revoke platform role / deactivate operator (requires PLATFORM_ADMIN)
 */
platformRouter.delete(
  '/users/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformService.deactivatePlatformUser(
        req.params.id,
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: 'Platform access revoked.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/platform/audit
 * Paginated platform audit logs with filtering
 */
platformRouter.get('/audit', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { action, entityType, restaurantId, userId, startDate, endDate, page, limit } = req.query;
    const result = await PlatformService.listPlatformAuditLogs({
      action: action ? (action as AuditAction) : undefined,
      entityType: entityType ? String(entityType) : undefined,
      restaurantId: restaurantId ? String(restaurantId) : undefined,
      userId: userId ? String(userId) : undefined,
      startDate: startDate ? String(startDate) : undefined,
      endDate: endDate ? String(endDate) : undefined,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/platform/settings
 * Retrieve SaaS platform settings
 */
platformRouter.get('/settings', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settings = await PlatformService.getPlatformSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/platform/settings
 * Update SaaS platform settings (requires PLATFORM_ADMIN)
 */
platformRouter.patch(
  '/settings',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformService.updatePlatformSettings(
        req.body,
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: 'Platform settings updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

platformRouter.put(
  '/settings',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformService.updatePlatformSettings(
        req.body,
        req.user!.id,
        req.user!.platformRole!
      );
      res.json({
        success: true,
        message: 'Platform settings updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * =============================================================================
 * PLATFORM SAAS SUBSCRIPTION MANAGEMENT
 * =============================================================================
 */

/**
 * GET /api/platform/restaurants/:id/subscription
 * Inspect restaurant subscription, plan, billing history, and lifecycle events
 */
platformRouter.get(
  '/restaurants/:id/subscription',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restaurantId = req.params.id;
      const status = await SubscriptionService.getSubscriptionStatus(restaurantId);

      if (!status) {
        res.status(404).json({
          success: false,
          errorCode: 'SUBSCRIPTION_NOT_FOUND',
          message: 'No subscription found for this restaurant.',
        });
        return;
      }

      const [payments, invoices, events] = await Promise.all([
        prisma.subscriptionPayment.findMany({
          where: { subscriptionId: status.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.subscriptionInvoice.findMany({
          where: { subscriptionId: status.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.subscriptionEvent.findMany({
          where: { subscriptionId: status.id },
          orderBy: { createdAt: 'desc' },
          include: {
            actor: { select: { id: true, name: true, email: true } },
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          ...status,
          payments,
          invoices,
          events,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/activate
 * Platform Admin manually activates subscription
 */
platformRouter.post(
  '/restaurants/:id/subscription/activate',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.activateSubscription(
        sub.id,
        req.user!.id,
        req.body.reason || 'Manual activation by Platform Admin'
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/suspend
 * Platform Admin suspends subscription
 */
platformRouter.post(
  '/restaurants/:id/subscription/suspend',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.suspendSubscription(
        sub.id,
        req.body.reason || 'Manual suspension by Platform Admin',
        req.user!.id
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/restore
 * Platform Admin restores subscription
 */
platformRouter.post(
  '/restaurants/:id/subscription/restore',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.restoreSubscription(
        sub.id,
        req.user!.id,
        req.body.reason || 'Manual restoration by Platform Admin'
      );
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/extend
 * Platform Admin grants manual extension (+days)
 */
platformRouter.post(
  '/restaurants/:id/subscription/extend',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const days = Number(req.body.days);
      const reason = req.body.reason || `Platform Admin extension (+${days} days)`;

      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.extendSubscription({
        subscriptionId: sub.id,
        days,
        reason,
        actorId: req.user!.id,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/change-plan
 * Platform Admin changes subscription plan
 */
platformRouter.post(
  '/restaurants/:id/subscription/change-plan',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.changePlan(
        sub.id,
        req.body.newPlanId,
        req.user!.id,
        req.body.reason
      );

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/assign
 * Platform Admin manually assigns a subscription (MANUAL or COMPLIMENTARY)
 */
platformRouter.post(
  '/restaurants/:id/subscription/assign',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { planId, assignmentType = 'MANUAL', periodEnd, reason, startsAt, agreedPrice, currency } = req.body;

      if (!planId || !periodEnd || !reason) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'planId, periodEnd, and reason are required.',
        });
        return;
      }

      const subscription = await SubscriptionService.manuallyAssignSubscription({
        restaurantId: req.params.id,
        planId,
        assignmentType,
        periodEnd: new Date(periodEnd),
        reason,
        assignedByUserId: req.user!.id,
        startsAt: startsAt ? new Date(startsAt) : undefined,
        agreedPrice: agreedPrice !== undefined ? Number(agreedPrice) : undefined,
        currency,
      });

      res.status(200).json({
        success: true,
        message: `Subscription successfully assigned (${assignmentType}).`,
        data: subscription,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'ASSIGN_FAILED',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/revoke
 * Platform Admin revokes subscription access immediately
 */
platformRouter.post(
  '/restaurants/:id/subscription/revoke',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        res.status(400).json({
          success: false,
          errorCode: 'REASON_REQUIRED',
          message: 'An explicit reason is required to revoke a subscription.',
        });
        return;
      }

      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.revokeSubscription(sub.id, req.user!.id, reason);
      res.json({
        success: true,
        message: 'Subscription successfully revoked.',
        data: updated,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'REVOKE_FAILED',
        message: err.message,
      });
    }
  }
);

/**
 * POST /api/platform/restaurants/:id/subscription/cancel-auto-renew
 * Platform Admin cancels auto-renewal
 */
platformRouter.post(
  '/restaurants/:id/subscription/cancel-auto-renew',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId: req.params.id },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.cancelAutoRenew(sub.id, req.user!.id, req.body.reason);
      res.json({
        success: true,
        message: 'Auto-renewal cancelled. Subscription remains active until period end.',
        data: updated,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'CANCEL_FAILED',
        message: err.message,
      });
    }
  }
);

/**
 * GET /api/platform/subscription-requests
 * Platform Admin lists all subscription requests across restaurants
 */
platformRouter.get(
  '/subscription-requests',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, status } = req.query;
      const requests = await SubscriptionService.getSubscriptionRequests({
        restaurantId: restaurantId ? String(restaurantId) : undefined,
        status: status ? (String(status) as any) : undefined,
      });
      res.json({ success: true, data: requests });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/subscription-requests/:id/review
 * Platform Admin reviews request (APPROVE or REJECT)
 */
platformRouter.post(
  '/subscription-requests/:id/review',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { action, rejectionReason } = req.body;
      if (!action || (action !== 'APPROVE' && action !== 'REJECT')) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_ACTION',
          message: "action must be 'APPROVE' or 'REJECT'.",
        });
        return;
      }

      if (action === 'REJECT' && (!rejectionReason || !rejectionReason.trim())) {
        res.status(400).json({
          success: false,
          errorCode: 'REJECTION_REASON_REQUIRED',
          message: 'rejectionReason is mandatory when rejecting a subscription request.',
        });
        return;
      }

      const request = await SubscriptionService.reviewSubscriptionRequest({
        requestId: req.params.id,
        reviewerUserId: req.user!.id,
        action,
        rejectionReason,
      });

      res.json({
        success: true,
        message: `Subscription request ${action.toLowerCase()}d successfully.`,
        data: request,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'REVIEW_FAILED',
        message: err.message,
      });
    }
  }
);

/**
 * GET /api/platform/subscriptions/plans
 * List all subscription plans for platform administration
 */
platformRouter.get('/subscriptions/plans', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' },
    });
    res.json({ success: true, data: plans });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/platform/subscriptions/plans
 * Create a new SaaS subscription plan
 */
platformRouter.post(
  '/subscriptions/plans',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code, name, description, price, currency, billingInterval, intervalCount, trialDays, gracePeriodDays } = req.body;
      const plan = await prisma.subscriptionPlan.create({
        data: {
          code: code.toUpperCase().trim(),
          name: name.trim(),
          description,
          price,
          currency: currency || 'EUR',
          billingInterval: billingInterval || 'MONTHLY',
          intervalCount: intervalCount || 1,
          trialDays: trialDays !== undefined ? trialDays : null,
          gracePeriodDays: gracePeriodDays !== undefined ? gracePeriodDays : 7,
          active: true,
          features: sanitizeFeatureKeys(req.body.features),
        },
      });
      res.status(201).json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/platform/subscriptions/plans/:id
 * Update plan metadata (name, description, future price)
 */
platformRouter.put(
  '/subscriptions/plans/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, description, price, gracePeriodDays, trialDays } = req.body;
      const plan = await prisma.subscriptionPlan.update({
        where: { id: req.params.id },
        data: {
          ...(name ? { name: name.trim() } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(price !== undefined ? { price } : {}),
          ...(gracePeriodDays !== undefined ? { gracePeriodDays } : {}),
          ...(trialDays !== undefined ? { trialDays } : {}),
          ...(req.body.features !== undefined ? { features: sanitizeFeatureKeys(req.body.features) } : {}),
        },
      });
      res.json({ success: true, data: plan });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/subscriptions/plans/:id/toggle
 * Toggle plan active status
 */
platformRouter.post(
  '/subscriptions/plans/:id/toggle',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const plan = await prisma.subscriptionPlan.findUnique({
        where: { id: req.params.id },
      });
      if (!plan) {
        res.status(404).json({ success: false, error: 'Plan not found' });
        return;
      }
      const updated = await prisma.subscriptionPlan.update({
        where: { id: req.params.id },
        data: { active: !plan.active },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// PLATFORM MESSAGING & BROADCASTS (PHASE 13B)
// =============================================================================

/**
 * GET /api/platform/messages
 * List messages with filters, stats, pagination
 */
platformRouter.get('/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, targetType, priority, search, page, limit } = req.query;
    const result = await PlatformMessageService.getPlatformMessages({
      status: status as any,
      targetType: targetType as any,
      priority: priority as any,
      search: typeof search === 'string' ? search : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/platform/messages
 * Compose and send or schedule a message
 */
platformRouter.post(
  '/messages',
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        title,
        body,
        targetType,
        targetRestaurantIds,
        filterStatus,
        filterActiveOnly,
        priority,
        pinned,
        requiresAcknowledgement,
        scheduledAt,
        expiresAt,
        confirmAll,
        isDraft,
      } = req.body;

      if (!title || typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ success: false, error: 'Title is required' });
        return;
      }

      if (!body || typeof body !== 'string' || !body.trim()) {
        res.status(400).json({ success: false, error: 'Message body is required' });
        return;
      }

      if (!targetType) {
        res.status(400).json({ success: false, error: 'Target type is required' });
        return;
      }

      // Explicit confirmation check for ALL_RESTAURANTS broadcasts
      if (targetType === 'ALL_RESTAURANTS' && !isDraft && confirmAll !== true) {
        res.status(400).json({
          success: false,
          errorCode: 'CONFIRMATION_REQUIRED',
          error: 'Explicit confirmation required to broadcast to all restaurants.',
        });
        return;
      }

      const message = await PlatformMessageService.createMessage(
        {
          title: title.trim(),
          body: body.trim(),
          targetType,
          targetRestaurantIds,
          filterStatus,
          filterActiveOnly,
          priority,
          pinned,
          requiresAcknowledgement,
          scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          isDraft,
          confirmAll,
        },
        req.user!.id
      );

      res.status(201).json({ success: true, data: message });
    } catch (err: any) {
      if (err.message && (err.message.includes('CONFIRMATION_REQUIRED') || err.message.includes('confirmation'))) {
        res.status(400).json({ success: false, errorCode: 'CONFIRMATION_REQUIRED', error: err.message });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/platform/messages/:id
 * Message details with delivery, read and acknowledgement stats + recipient breakdown
 */
platformRouter.get(
  '/messages/:id',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const details = await PlatformMessageService.getMessageDetails(req.params.id);
      if (!details) {
        res.status(404).json({ success: false, error: 'Message not found' });
        return;
      }
      res.json({ success: true, data: details });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/platform/messages/:id/cancel
 * Cancel a scheduled message
 */
platformRouter.post(
  '/messages/:id/cancel',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cancelled = await PlatformMessageService.cancelScheduledMessage(req.params.id, req.user!.id);
      res.json({ success: true, data: cancelled });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

/**
 * PATCH /api/platform/messages/:id
 * Edit a draft or already-sent message (with non-destructive revision history)
 */
platformRouter.patch(
  '/messages/:id',
  validateUuidParams(['id']),
  requirePlatformRole(PlatformRole.PLATFORM_ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await PlatformMessageService.editMessage(req.params.id, req.user!.id, req.body);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

