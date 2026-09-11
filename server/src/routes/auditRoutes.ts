import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, Role } from '@prisma/client';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess } from '../middleware/authMiddleware';

export const auditRouter = Router();

/**
 * GET /api/restaurants/:restaurantId/audit-logs
 * Protected enterprise audit log inspection with filtering and pagination.
 * Restricted strictly to OWNER and ADMIN.
 */
auditRouter.get(
  '/restaurants/:restaurantId/audit-logs',
  validateUuidParams(['restaurantId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { page, limit, action, entityType, startDate, endDate } = req.query;

      let parsedAction: AuditAction | undefined;
      if (typeof action === 'string' && Object.values(AuditAction).includes(action as AuditAction)) {
        parsedAction = action as AuditAction;
      }

      const result = await AuditService.listByRestaurant(restaurantId, {
        page: page ? Number(page) : 1,
        limit: limit ? Number(limit) : 20,
        action: parsedAction,
        entityType: typeof entityType === 'string' ? entityType : undefined,
        startDate: typeof startDate === 'string' ? startDate : undefined,
        endDate: typeof endDate === 'string' ? endDate : undefined,
      });

      res.status(200).json({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
