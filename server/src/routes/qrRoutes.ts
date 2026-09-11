import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, QrTargetType, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess } from '../middleware/authMiddleware';

export const qrRouter = Router();

// GET /api/restaurants/:restaurantId/qr
qrRouter.get(
  '/restaurants/:restaurantId/qr',
  validateUuidParams(['restaurantId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER, Role.STAFF]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const qrs = await prisma.qrCode.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: qrs });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/qr (OWNER & ADMIN only)
qrRouter.post(
  '/restaurants/:restaurantId/qr',
  validateUuidParams(['restaurantId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { name, slug, targetType, targetValue, active } = req.body;

      if (!name || !targetValue) {
        res.status(400).json({
          success: false,
          message: 'name and targetValue are required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      if (targetType === 'TABLE_MENU' || targetType === QrTargetType.TABLE_MENU) {
        const targetStr = String(targetValue).trim();
        const extractedTableNum = targetStr.includes('/table/')
          ? targetStr.split('/table/')[1].split(/[\/?#]/)[0]
          : targetStr.includes('/')
          ? targetStr.split('/').filter(Boolean).pop()
          : targetStr;

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const orConditions: any[] = [{ number: targetStr }];
        if (isUuid.test(targetStr)) {
          orConditions.push({ id: targetStr });
        }
        if (extractedTableNum && extractedTableNum !== targetStr) {
          orConditions.push({ number: extractedTableNum });
          if (isUuid.test(extractedTableNum)) {
            orConditions.push({ id: extractedTableNum });
          }
        }

        const table = await prisma.table.findFirst({
          where: {
            restaurantId,
            OR: orConditions,
          },
        });

        if (!table) {
          res.status(400).json({
            success: false,
            message: `Referenced table '${targetValue}' does not belong to this restaurant.`,
            errorCode: 'INVALID_TABLE_TARGET',
          });
          return;
        }
      }

      const generatedSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + `-${Date.now().toString(36).slice(-4)}`;

      const qr = await prisma.qrCode.create({
        data: {
          restaurantId,
          name,
          slug: generatedSlug,
          targetType: targetType === 'TABLE_MENU' ? QrTargetType.TABLE_MENU : QrTargetType.RESTAURANT_MENU,
          targetValue,
          active: active !== undefined ? Boolean(active) : true,
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'QrCode',
        entityId: qr.id,
        metadata: { name: qr.name, targetType: qr.targetType },
      });

      res.status(201).json({ success: true, data: qr });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/qr/:id (OWNER & ADMIN only)
qrRouter.delete(
  '/qr/:id',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const deleted = await prisma.qrCode.delete({ where: { id } });

      await AuditService.log({
        restaurantId: deleted.restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'QrCode',
        entityId: id,
        metadata: { name: deleted.name },
      });

      res.json({ success: true, message: 'QR code configuration deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
