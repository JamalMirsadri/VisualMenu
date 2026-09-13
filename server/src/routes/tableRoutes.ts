import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, Role, QrTargetType } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, requirePermission, requireAnyPermission, authenticateToken } from '../middleware/authMiddleware';
import { FloorService } from '../services/floorService';
import { hasPermission } from '../constants/permissions';

export const tableRouter = Router();

/**
 * GET /api/restaurants/:restaurantId/tables
 * Lists all tables for a given restaurant.
 */
tableRouter.get(
  '/restaurants/:restaurantId/tables',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_TABLES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const tables = await prisma.table.findMany({
        where: { restaurantId },
        orderBy: [{ number: 'asc' }],
        include: {
          qrCodes: {
            where: { active: true },
            select: { id: true, slug: true, targetValue: true },
          },
          _count: {
            select: { orders: true },
          },
        },
      });

      res.status(200).json({
        success: true,
        data: tables,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/tables
 * Creates a new dining table and automatically provisions its QR code.
 */
tableRouter.post(
  '/restaurants/:restaurantId/tables',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('MANAGE_TABLES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { number, name, capacity, location, active } = req.body;

      if (!number || typeof number !== 'string' || !number.trim()) {
        res.status(400).json({
          success: false,
          message: 'Table number is required and must be a non-empty string.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({
          success: false,
          message: 'Table name is required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const tableNumberTrimmed = number.trim();
      const tableNameTrimmed = name.trim();
      const tableCapacity = capacity ? Math.max(1, parseInt(String(capacity), 10) || 2) : 2;
      const isTableActive = active !== undefined ? Boolean(active) : true;

      // Verify unique table number within restaurant
      const existingTable = await prisma.table.findUnique({
        where: {
          restaurantId_number: {
            restaurantId,
            number: tableNumberTrimmed,
          },
        },
      });

      if (existingTable) {
        res.status(409).json({
          success: false,
          message: `Table number '${tableNumberTrimmed}' already exists for this restaurant.`,
          errorCode: 'DUPLICATE_TABLE_NUMBER',
        });
        return;
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true, name: true },
      });

      if (!restaurant) {
        res.status(404).json({
          success: false,
          message: 'Restaurant not found.',
          errorCode: 'RESTAURANT_NOT_FOUND',
        });
        return;
      }

      const table = await prisma.table.create({
        data: {
          restaurantId,
          number: tableNumberTrimmed,
          name: tableNameTrimmed,
          capacity: tableCapacity,
          location: location?.trim() || null,
          active: isTableActive,
        },
      });

      // Provision associated QR code
      const qrSlug = `table-${tableNumberTrimmed}-${restaurant.slug}-${Date.now().toString(36)}`;
      await prisma.qrCode.create({
        data: {
          restaurantId,
          tableId: table.id,
          name: `Table ${tableNumberTrimmed} QR`,
          slug: qrSlug,
          targetType: QrTargetType.TABLE_MENU,
          targetValue: `/menu/${restaurant.slug}/table/${tableNumberTrimmed}`,
          active: true,
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'Table',
        entityId: table.id,
        newValues: table,
      });

      res.status(201).json({
        success: true,
        message: 'Table created successfully.',
        data: table,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/tables/:tableId
 * Retrieves table details.
 */
tableRouter.get(
  '/restaurants/:restaurantId/tables/:tableId',
  authenticateToken,
  validateUuidParams(['restaurantId', 'tableId']),
  requirePermission('VIEW_TABLES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, tableId } = req.params;
      const table = await prisma.table.findFirst({
        where: { id: tableId, restaurantId },
        include: {
          qrCodes: true,
          _count: { select: { orders: true } },
        },
      });

      if (!table) {
        res.status(404).json({
          success: false,
          message: 'Table not found.',
          errorCode: 'TABLE_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ success: true, data: table });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/restaurants/:restaurantId/tables/:tableId
 * Updates table details.
 */
tableRouter.put(
  '/restaurants/:restaurantId/tables/:tableId',
  authenticateToken,
  validateUuidParams(['restaurantId', 'tableId']),
  requirePermission('MANAGE_TABLES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, tableId } = req.params;
      const { number, name, capacity, location, active } = req.body;

      const existing = await prisma.table.findFirst({
        where: { id: tableId, restaurantId },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Table not found.',
          errorCode: 'TABLE_NOT_FOUND',
        });
        return;
      }

      // If number is changing, check uniqueness
      const newNumber = number ? String(number).trim() : existing.number;
      if (newNumber !== existing.number) {
        const duplicate = await prisma.table.findUnique({
          where: {
            restaurantId_number: {
              restaurantId,
              number: newNumber,
            },
          },
        });
        if (duplicate && duplicate.id !== tableId) {
          res.status(409).json({
            success: false,
            message: `Table number '${newNumber}' is already in use.`,
            errorCode: 'DUPLICATE_TABLE_NUMBER',
          });
          return;
        }
      }

      const updated = await prisma.table.update({
        where: { id: tableId },
        data: {
          number: newNumber,
          name: name ? String(name).trim() : existing.name,
          capacity: capacity !== undefined ? Math.max(1, parseInt(String(capacity), 10) || 1) : existing.capacity,
          location: location !== undefined ? (location ? String(location).trim() : null) : existing.location,
          active: active !== undefined ? Boolean(active) : existing.active,
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Table',
        entityId: tableId,
        oldValues: existing,
        newValues: updated,
      });

      res.status(200).json({
        success: true,
        message: 'Table updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/restaurants/:restaurantId/tables/:tableId
 * Deletes or deactivates table safely.
 */
tableRouter.delete(
  '/restaurants/:restaurantId/tables/:tableId',
  authenticateToken,
  validateUuidParams(['restaurantId', 'tableId']),
  requirePermission('MANAGE_TABLES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, tableId } = req.params;

      const existing = await prisma.table.findFirst({
        where: { id: tableId, restaurantId },
        include: {
          _count: { select: { orders: true } },
        },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Table not found.',
          errorCode: 'TABLE_NOT_FOUND',
        });
        return;
      }

      if (existing._count.orders > 0) {
        // Soft deactivate to preserve historical order records
        const deactivated = await prisma.table.update({
          where: { id: tableId },
          data: { active: false },
        });

        await AuditService.log({
          restaurantId,
          userId: req.user?.id,
          action: AuditAction.UPDATE,
          entityType: 'Table',
          entityId: tableId,
          oldValues: existing,
          newValues: deactivated,
          metadata: { note: 'Table deactivated because it has linked order history.' },
        });

        res.status(200).json({
          success: true,
          message: 'Table has associated orders. It has been deactivated instead of deleted.',
          data: deactivated,
        });
        return;
      }

      // Safe hard delete if no historical orders
      await prisma.table.delete({ where: { id: tableId } });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'Table',
        entityId: tableId,
        oldValues: existing,
      });

      res.status(200).json({
        success: true,
        message: 'Table deleted successfully.',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/floor
 * Returns real-time visual floor overview with derived table operational states.
 */
tableRouter.get(
  '/restaurants/:restaurantId/floor',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requireAnyPermission(['VIEW_TABLES', 'VIEW_ORDERS', 'VIEW_FLOOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;

      const role = req.userRole || Role.STAFF;
      const canViewPayments =
        hasPermission(role, 'VIEW_PAYMENTS', req.userPermissions) ||
        hasPermission(role, 'VIEW_PAYMENT_STATUS', req.userPermissions);
      const canViewCustomers = hasPermission(role, 'VIEW_CUSTOMERS', req.userPermissions);

      const floor = await FloorService.getRestaurantFloorState(restaurantId, {
        canViewPayments,
        canViewCustomers,
      });

      res.status(200).json({
        success: true,
        data: floor,
        ...floor,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/tables/:tableId/operational-state
 * Detailed operational breakdown for Table Detail Drawer.
 */
tableRouter.get(
  '/restaurants/:restaurantId/tables/:tableId/operational-state',
  authenticateToken,
  validateUuidParams(['restaurantId', 'tableId']),
  requireAnyPermission(['VIEW_TABLES', 'VIEW_ORDERS', 'VIEW_FLOOR']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, tableId } = req.params;

      const table = await prisma.table.findFirst({
        where: { id: tableId, restaurantId },
        include: {
          qrCodes: { where: { active: true } },
          orders: {
            where: { status: { notIn: ['CANCELLED'] } },
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: {
              items: {
                include: {
                  foodItem: {
                    select: { id: true, name: true, price: true },
                  },
                },
              },
              payments: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              assignedWaiter: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      });

      if (!table) {
        res.status(404).json({
          success: false,
          message: 'Table not found.',
          errorCode: 'TABLE_NOT_FOUND',
        });
        return;
      }

      const role = req.userRole || Role.STAFF;
      const canViewPayments =
        hasPermission(role, 'VIEW_PAYMENTS', req.userPermissions) ||
        hasPermission(role, 'VIEW_PAYMENT_STATUS', req.userPermissions);

      const derivedState = FloorService.deriveTableState(table, table.orders);

      const sanitizedOrders = table.orders.map((order) => {
        const isPaid = order.payments?.[0]?.status === 'PAID';
        return {
          id: order.id,
          orderNumber: order.orderNumber,
          publicToken: order.publicToken,
          status: order.status,
          priority: (order as any).priority || 'NORMAL',
          customerNote: order.customerNote,
          customerName: order.customerName,
          createdAt: order.createdAt,
          items: order.items.map((it) => ({
            id: it.id,
            name: it.foodNameSnapshot,
            quantity: it.quantity,
            unitPrice: canViewPayments ? Number(it.unitPrice) : undefined,
            lineTotal: canViewPayments ? Number(it.lineTotal) : undefined,
            customerNote: it.customerNote,
            status: it.status,
          })),
          assignedWaiter: order.assignedWaiter
            ? {
                id: order.assignedWaiter.userId,
                userRestaurantId: order.assignedWaiter.id,
                name: order.assignedWaiter.user?.name || 'Waiter',
                email: order.assignedWaiter.user?.email || '',
              }
            : null,
          payment: canViewPayments
            ? {
                status: order.payments?.[0]?.status || 'UNPAID',
                method: order.payments?.[0]?.method,
                total: Number(order.total),
                amountDue: isPaid ? 0 : Number(order.total),
                isPaid,
              }
            : undefined,
        };
      });

      const responseData = {
        table: {
          id: table.id,
          number: table.number,
          name: table.name,
          capacity: table.capacity,
          location: table.location,
          active: table.active,
          qrCodeUrl: table.qrCodes?.[0]?.targetValue || null,
        },
        state: derivedState,
        derivedState,
        activeOrderCount: table.orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes(o.status)).length,
        orders: sanitizedOrders,
      };

      res.status(200).json({
        success: true,
        data: responseData,
        ...responseData,
      });
    } catch (err) {
      next(err);
    }
  }
);
