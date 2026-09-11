import { Router, Request, Response, NextFunction } from 'express';
import { PlatformRole, AuditAction } from '@prisma/client';
import { PlatformService } from '../services/platformService';
import { RestaurantProvisioningService } from '../services/restaurantProvisioningService';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';

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
