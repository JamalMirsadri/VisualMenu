import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, requirePermission, authenticateToken } from '../middleware/authMiddleware';
import { hasPermission } from '../constants/permissions';

export const restaurantRouter = Router();

// GET /api/restaurants
restaurantRouter.get('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    // Normal restaurant users only receive their own assigned restaurant(s)
    let whereClause: any = {};
    if (req.user.platformRole !== 'PLATFORM_ADMIN') {
      whereClause = {
        userRestaurants: {
          some: {
            userId: req.user.id,
          },
        },
      };
    }

    const restaurants = await prisma.restaurant.findMany({
      where: whereClause,
      orderBy: { name: 'asc' },
      include: {
        settings: true,
        userRestaurants: {
          where: req.user ? { userId: req.user.id } : undefined,
          select: { role: true },
        },
        _count: {
          select: {
            categories: true,
            foods: { where: { deletedAt: null } },
            tables: { where: { active: true } },
            orders: true,
            userRestaurants: true,
          },
        },
      },
    });

    const formatted = restaurants.map((r) => ({
      ...r,
      role: r.userRestaurants[0]?.role || Role.OWNER,
      memberCount: r._count.userRestaurants,
      dishCount: r._count.foods,
      tableCount: r._count.tables,
      orderCount: r._count.orders,
    }));

    res.json({ success: true, data: formatted });
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/by-slug/:slug — explicit slug lookup (public/onboarding)
restaurantRouter.get('/by-slug/:slug', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { slug } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      include: { settings: true },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: `Restaurant with slug '${slug}' not found.`,
        errorCode: 'RESTAURANT_NOT_FOUND',
      });
      return;
    }
    res.json({ success: true, data: restaurant });
  } catch (err) {
    next(err);
  }
});

// GET /api/restaurants/:id — UUID lookup (admin tenant context)
restaurantRouter.get('/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: { settings: true },
    });

    if (!restaurant) {
      res.status(404).json({
        success: false,
        message: `Restaurant with id '${id}' not found.`,
        errorCode: 'RESTAURANT_NOT_FOUND',
      });
      return;
    }
    res.json({ success: true, data: restaurant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/restaurants/:id/status
restaurantRouter.patch(
  '/:id/status',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { active } = req.body;

      if (active === undefined) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'active boolean field is required.',
        });
        return;
      }

      const updated = await prisma.restaurant.update({
        where: { id },
        data: { active: Boolean(active) },
      });

      await AuditService.log({
        restaurantId: id,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Restaurant',
        entityId: id,
        newValues: { active: updated.active },
      });

      res.status(200).json({
        success: true,
        message: `Restaurant is now ${updated.active ? 'ACTIVE' : 'INACTIVE'}.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants
// Restaurant creation is strictly restricted to Platform Administrators
restaurantRouter.post('/', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (req.user?.platformRole !== 'PLATFORM_ADMIN') {
      res.status(403).json({
        success: false,
        errorCode: 'PLATFORM_ACCESS_DENIED',
        message: 'Restaurant creation is restricted to Platform Administrators. Use the Platform SaaS portal.',
      });
      return;
    }

    const {
      slug,
      name,
      tagline,
      description,
      logo,
      coverImage,
      favicon,
      phone,
      email,
      address,
      website,
      currency,
      currencySymbol,
      defaultLanguage,
      active,
    } = req.body;

    if (!slug || !name) {
      res.status(400).json({
        success: false,
        message: 'Name and slug are required fields.',
        errorCode: 'VALIDATION_ERROR',
      });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const rest = await tx.restaurant.create({
        data: {
          slug,
          name,
          tagline,
          description,
          logo,
          coverImage,
          favicon,
          phone,
          email,
          address,
          website,
          currency: currency || 'EUR',
          currencySymbol: currencySymbol || '€',
          defaultLanguage: defaultLanguage || 'en',
          active: active !== undefined ? Boolean(active) : true,
        },
      });

      // Default settings
      await tx.restaurantSettings.create({
        data: {
          restaurantId: rest.id,
        },
      });

      // Assign creator as OWNER if authenticated
      if (req.user) {
        await tx.userRestaurant.create({
          data: {
            userId: req.user.id,
            restaurantId: rest.id,
            role: Role.OWNER,
          },
        });
      }

      return rest;
    });

    await AuditService.log({
      restaurantId: created.id,
      userId: req.user?.id,
      action: AuditAction.CREATE,
      entityType: 'Restaurant',
      entityId: created.id,
      metadata: { name: created.name, slug: created.slug },
    });

    res.status(201).json({ success: true, data: created });
  } catch (err) {
    next(err);
  }
});

// PUT /api/restaurants/:id (OWNER only)
restaurantRouter.put(
  '/:id',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        name,
        tagline,
        description,
        logo,
        coverImage,
        favicon,
        phone,
        email,
        address,
        website,
        currency,
        currencySymbol,
        defaultLanguage,
        active,
      } = req.body;

      const updated = await prisma.restaurant.update({
        where: { id },
        data: {
          name,
          tagline,
          description,
          logo,
          coverImage,
          favicon,
          phone,
          email,
          address,
          website,
          currency,
          currencySymbol,
          defaultLanguage,
          active: active !== undefined ? Boolean(active) : undefined,
        },
        include: { settings: true },
      });

      await AuditService.log({
        restaurantId: updated.id,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Restaurant',
        entityId: updated.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/restaurants/:id (OWNER only)
restaurantRouter.delete(
  '/:id',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await prisma.restaurant.delete({ where: { id } });

      await AuditService.log({
        restaurantId: id,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'Restaurant',
        entityId: id,
      });

      res.json({ success: true, message: 'Restaurant deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:id/dashboard-metrics
 * Returns dynamically scoped operational metrics tailored to caller's effective permissions.
 * Sensitive financial metrics (revenue, sales) are omitted if caller lacks VIEW_FINANCIAL_REPORTS.
 */
restaurantRouter.get(
  '/:id/dashboard-metrics',
  validateUuidParams(['id']),
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;

      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user!.id,
            restaurantId,
          },
        },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });

      if (!membership && req.user!.platformRole !== 'PLATFORM_ADMIN') {
        res.status(403).json({
          success: false,
          errorCode: 'RESTAURANT_ACCESS_DENIED',
          message: 'You are not assigned to this restaurant tenant.',
        });
        return;
      }

      if (membership?.status === 'DISABLED') {
        res.status(403).json({
          success: false,
          errorCode: 'STAFF_DISABLED',
          message: 'Your access to this restaurant has been disabled by management.',
        });
        return;
      }

      const role = req.user!.platformRole === 'PLATFORM_ADMIN' ? Role.OWNER : membership!.role;
      const assignedPermKeys = membership ? membership.permissions.map((p) => p.permission.key) : [];
      const customPerms = (membership && (membership.permissions.length > 0 || membership.jobTemplate !== null))
        ? assignedPermKeys
        : undefined;

      // Check operational capabilities
      const canViewOrders = hasPermission(role, 'VIEW_ORDERS', customPerms);
      const canViewKitchen = hasPermission(role, 'VIEW_KITCHEN', customPerms) || hasPermission(role, 'VIEW_KITCHEN_ORDERS', customPerms);
      const canViewPayments = hasPermission(role, 'VIEW_PAYMENTS', customPerms);
      const canViewFinancial = hasPermission(role, 'VIEW_FINANCIAL_REPORTS', customPerms);
      const canViewMenu = hasPermission(role, 'VIEW_MENU', customPerms);
      const canViewStaff = hasPermission(role, 'VIEW_STAFF', customPerms);
      const canViewTables = hasPermission(role, 'VIEW_TABLES', customPerms);

      const responseData: Record<string, any> = {
        restaurantId,
        role,
        template: membership?.jobTemplate || null,
        capabilities: {
          canViewOrders,
          canViewKitchen,
          canViewPayments,
          canViewFinancial,
          canViewMenu,
          canViewStaff,
          canViewTables,
        },
      };

      // 1. Orders metrics (if permitted)
      if (canViewOrders) {
        const [pendingOrders, activeOrders, openOrders, completedToday] = await Promise.all([
          prisma.order.count({ where: { restaurantId, status: 'PENDING' } }),
          prisma.order.count({ where: { restaurantId, status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'SERVED'] } } }),
          prisma.order.count({ where: { restaurantId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
          prisma.order.count({
            where: {
              restaurantId,
              status: 'COMPLETED',
              createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            },
          }),
        ]);
        responseData.orderMetrics = {
          pendingOrders,
          activeOrders,
          openOrders,
          completedToday,
        };
      }

      // 2. Kitchen metrics (if permitted)
      if (canViewKitchen) {
        const [preparingCount, readyCount, confirmedQueue] = await Promise.all([
          prisma.order.count({ where: { restaurantId, status: 'PREPARING' } }),
          prisma.order.count({ where: { restaurantId, status: 'READY' } }),
          prisma.order.count({ where: { restaurantId, status: { in: ['PENDING', 'CONFIRMED'] } } }),
        ]);
        responseData.kitchenMetrics = {
          preparingCount,
          readyCount,
          confirmedQueue,
        };
      }

      // 3. Payments metrics (if permitted)
      if (canViewPayments) {
        const [pendingPayments, paidOrdersCount] = await Promise.all([
          prisma.payment.count({ where: { restaurantId, status: { in: ['PENDING', 'UNPAID'] } } }),
          prisma.payment.count({ where: { restaurantId, status: 'PAID' } }),
        ]);
        responseData.paymentMetrics = {
          pendingPayments,
          paidOrdersCount,
        };
      }

      // 4. Financial metrics (strictly gated by VIEW_FINANCIAL_REPORTS)
      if (canViewFinancial) {
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
        const [todayPaid, allPaid] = await Promise.all([
          prisma.payment.findMany({
            where: { restaurantId, status: 'PAID', createdAt: { gte: startOfDay } },
            select: { amount: true },
          }),
          prisma.payment.findMany({
            where: { restaurantId, status: 'PAID' },
            select: { amount: true, method: true },
          }),
        ]);

        const todaySales = todayPaid.reduce((acc, p) => acc + Number(p.amount), 0);
        const totalRevenue = allPaid.reduce((acc, p) => acc + Number(p.amount), 0);
        const cashPaymentsCount = allPaid.filter((p) => p.method === 'CASH').length;
        const cardPaymentsCount = allPaid.filter((p) => p.method === 'CARD' || p.method === 'MBWAY').length;

        responseData.financialMetrics = {
          todaySales: Math.round(todaySales * 100) / 100,
          todayRevenue: Math.round(todaySales * 100) / 100,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          cashPaymentsCount,
          cardPaymentsCount,
        };
      }

      // 5. Menu metrics (if permitted)
      if (canViewMenu) {
        const [foodCount, availableFoodCount, categoryCount] = await Promise.all([
          prisma.foodItem.count({ where: { restaurantId, deletedAt: null } }),
          prisma.foodItem.count({ where: { restaurantId, deletedAt: null, available: true } }),
          prisma.category.count({ where: { restaurantId, active: true } }),
        ]);
        responseData.menuMetrics = {
          foodCount,
          availableFoodCount,
          categoryCount,
        };
      }

      // 6. Staff metrics (if permitted)
      if (canViewStaff) {
        const [staffCount, activeStaffCount] = await Promise.all([
          prisma.userRestaurant.count({ where: { restaurantId } }),
          prisma.userRestaurant.count({ where: { restaurantId, status: 'ACTIVE' } }),
        ]);
        responseData.staffMetrics = {
          staffCount,
          activeStaffCount,
        };
      }

      res.status(200).json({
        success: true,
        data: responseData,
      });
    } catch (err) {
      next(err);
    }
  }
);
