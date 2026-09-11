import bcrypt from 'bcryptjs';
import { AuditAction, PlatformRole, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from './auditService';

export interface ListRestaurantsParams {
  search?: string;
  status?: 'all' | 'active' | 'inactive';
  page?: number;
  limit?: number;
}

export interface ListPlatformUsersParams {
  search?: string;
  role?: PlatformRole;
  page?: number;
  limit?: number;
}

export interface ListPlatformAuditParams {
  action?: AuditAction;
  entityType?: string;
  restaurantId?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export class PlatformService {
  /**
   * Cross-tenant platform metrics aggregation
   */
  static async getPlatformMetrics() {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalRestaurants,
      activeRestaurants,
      totalUsers,
      platformUsers,
      ordersTodayCount,
      openOrdersCount,
      paymentsTodayAgg,
      totalRevenueAgg,
    ] = await Promise.all([
      prisma.restaurant.count(),
      prisma.restaurant.count({ where: { active: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { platformRole: { not: null } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.count({
        where: { status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] } },
      }),
      prisma.payment.aggregate({
        where: {
          status: 'PAID',
          createdAt: { gte: startOfDay },
        },
        _count: { id: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
    ]);

    return {
      totalRestaurants,
      activeRestaurants,
      inactiveRestaurants: totalRestaurants - activeRestaurants,
      totalUsers,
      platformUsers,
      ordersToday: ordersTodayCount,
      openOrders: openOrdersCount,
      paymentsToday: paymentsTodayAgg._count.id || 0,
      revenueToday: Number(paymentsTodayAgg._sum.amount || 0),
      totalRevenue: Number(totalRevenueAgg._sum.amount || 0),
      systemHealth: {
        database: 'healthy',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Server-side paginated and filtered restaurant list
   */
  static async listRestaurants(params: ListRestaurantsParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.RestaurantWhereInput = {};

    if (params.status === 'active') {
      where.active = true;
    } else if (params.status === 'inactive') {
      where.active = false;
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, restaurants] = await Promise.all([
      prisma.restaurant.count({ where }),
      prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          settings: true,
          userRestaurants: {
            where: { role: 'OWNER' },
            take: 1,
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: {
              foods: { where: { deletedAt: null } },
              categories: true,
              tables: true,
              orders: true,
              userRestaurants: true,
            },
          },
        },
      }),
    ]);

    const items = restaurants.map((r) => {
      const owner = r.userRestaurants[0]?.user || null;
      // Plan placeholder badge (no billing logic)
      let planBadge = 'PRO';
      if (r._count.orders > 50) planBadge = 'ENTERPRISE';
      else if (r._count.orders < 5) planBadge = 'STARTER';

      return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        tagline: r.tagline,
        logo: r.logo,
        address: r.address,
        currency: r.currency,
        currencySymbol: r.currencySymbol,
        defaultLanguage: r.defaultLanguage,
        active: r.active,
        provisioningStatus: r.provisioningStatus,
        createdAt: r.createdAt,
        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,
        plan: planBadge,
        dishCount: r._count.foods,
        categoryCount: r._count.categories,
        tableCount: r._count.tables,
        orderCount: r._count.orders,
        userCount: r._count.userRestaurants,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Full restaurant detail view for Platform Admin
   */
  static async getRestaurantDetails(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        settings: true,
        userRestaurants: {
          include: {
            user: {
              select: { id: true, name: true, email: true, active: true, createdAt: true },
            },
          },
        },
        ownerInvitations: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        _count: {
          select: {
            categories: true,
            foods: { where: { deletedAt: null } },
            media: true,
            tables: true,
            orders: true,
            payments: true,
            customers: true,
            fiscalDocuments: true,
          },
        },
      },
    });

    if (!restaurant) {
      return null;
    }

    // Orders summary
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [ordersToday, openOrders, paidPayments] = await Promise.all([
      prisma.order.count({
        where: { restaurantId, createdAt: { gte: startOfDay } },
      }),
      prisma.order.count({
        where: {
          restaurantId,
          status: { in: ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] },
        },
      }),
      prisma.payment.aggregate({
        where: { restaurantId, status: 'PAID' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const latestInvitation = restaurant.ownerInvitations[0] || null;
    let invitationStatus: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'NONE' = 'NONE';
    if (latestInvitation) {
      if (latestInvitation.acceptedAt) invitationStatus = 'ACCEPTED';
      else if (latestInvitation.revokedAt) invitationStatus = 'REVOKED';
      else if (new Date() > new Date(latestInvitation.expiresAt)) invitationStatus = 'EXPIRED';
      else invitationStatus = 'PENDING';
    }

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        tagline: restaurant.tagline,
        description: restaurant.description,
        logo: restaurant.logo,
        coverImage: restaurant.coverImage,
        phone: restaurant.phone,
        email: restaurant.email,
        address: restaurant.address,
        website: restaurant.website,
        currency: restaurant.currency,
        currencySymbol: restaurant.currencySymbol,
        defaultLanguage: restaurant.defaultLanguage,
        active: restaurant.active,
        provisioningStatus: restaurant.provisioningStatus,
        provisionedAt: restaurant.provisionedAt,
        activatedAt: restaurant.activatedAt,
        createdAt: restaurant.createdAt,
        updatedAt: restaurant.updatedAt,
      },
      settings: restaurant.settings,
      members: restaurant.userRestaurants.map((ur) => ({
        id: ur.id,
        role: ur.role,
        createdAt: ur.createdAt,
        user: ur.user,
      })),
      invitation: latestInvitation
        ? {
            id: latestInvitation.id,
            status: invitationStatus,
            invitedEmail: latestInvitation.invitedEmail,
            invitedName: latestInvitation.invitedName,
            expiresAt: latestInvitation.expiresAt,
            acceptedAt: latestInvitation.acceptedAt,
            revokedAt: latestInvitation.revokedAt,
            createdAt: latestInvitation.createdAt,
          }
        : null,
      stats: {
        categories: restaurant._count.categories,
        foods: restaurant._count.foods,
        media: restaurant._count.media,
        tables: restaurant._count.tables,
        totalOrders: restaurant._count.orders,
        ordersToday,
        openOrders,
        totalPayments: paidPayments._count.id || 0,
        totalRevenue: Number(paidPayments._sum.amount || 0),
        totalCustomers: restaurant._count.customers,
        fiscalDocuments: restaurant._count.fiscalDocuments,
      },
    };
  }

  /**
   * Activate or deactivate restaurant
   */
  static async setRestaurantStatus(
    restaurantId: string,
    active: boolean,
    actorUserId: string,
    actorPlatformRole: PlatformRole
  ) {
    const updated = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: { active },
    });

    await AuditService.log({
      restaurantId,
      userId: actorUserId,
      action: active ? AuditAction.ACTIVATE : AuditAction.DEACTIVATE,
      entityType: 'Restaurant',
      entityId: restaurantId,
      metadata: {
        actorPlatformRole,
        action: active ? 'ACTIVATE' : 'DEACTIVATE',
        active,
      },
    });

    return updated;
  }

  /**
   * Record context enter/exit audit event
   */
  static async recordContextSwitch(
    actorUserId: string,
    actorPlatformRole: PlatformRole,
    restaurantId: string,
    action: 'ENTER' | 'EXIT',
    ipAddress?: string
  ) {
    return await prisma.auditLog.create({
      data: {
        restaurantId,
        userId: actorUserId,
        action: action === 'ENTER' ? AuditAction.CONTEXT_ENTER : AuditAction.CONTEXT_EXIT,
        entityType: 'RestaurantContext',
        entityId: restaurantId,
        actorPlatformRole,
        ipAddress: ipAddress || null,
        metadata: {
          actorPlatformRole,
          direction: action,
          timestamp: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * List platform users (SaaS operators)
   */
  static async listPlatformUsers(params: ListPlatformUsersParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      platformRole: { not: null },
    };

    if (params.role) {
      where.platformRole = params.role;
    }

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          platformRole: true,
          active: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    return {
      items: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Create a new platform user
   */
  static async createPlatformUser(data: {
    name: string;
    email: string;
    password: string;
    platformRole: PlatformRole;
    actorUserId?: string;
    actorPlatformRole?: PlatformRole;
  }) {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existing) {
      // If user already exists, elevate/assign platform role
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: {
          platformRole: data.platformRole,
          name: data.name || existing.name,
        },
        select: {
          id: true,
          name: true,
          email: true,
          platformRole: true,
          active: true,
          createdAt: true,
        },
      });

      await AuditService.log({
        userId: data.actorUserId,
        action: AuditAction.UPDATE,
        entityType: 'PlatformUser',
        entityId: updated.id,
        metadata: {
          actorPlatformRole: data.actorPlatformRole,
          assignedRole: data.platformRole,
          mode: 'ELEVATED_EXISTING',
        },
      });

      return updated;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase().trim(),
        passwordHash,
        platformRole: data.platformRole,
        active: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        active: true,
        createdAt: true,
      },
    });

    await AuditService.log({
      userId: data.actorUserId,
      action: AuditAction.CREATE,
      entityType: 'PlatformUser',
      entityId: user.id,
      metadata: {
        actorPlatformRole: data.actorPlatformRole,
        platformRole: data.platformRole,
      },
    });

    return user;
  }

  /**
   * Update platform user
   */
  static async updatePlatformUser(
    id: string,
    data: {
      platformRole?: PlatformRole;
      active?: boolean;
      name?: string;
    },
    actorUserId?: string,
    actorPlatformRole?: PlatformRole
  ) {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        platformRole: data.platformRole,
        active: data.active,
        name: data.name,
      },
      select: {
        id: true,
        name: true,
        email: true,
        platformRole: true,
        active: true,
        createdAt: true,
      },
    });

    await AuditService.log({
      userId: actorUserId,
      action: AuditAction.UPDATE,
      entityType: 'PlatformUser',
      entityId: updated.id,
      metadata: {
        actorPlatformRole,
        updates: data,
      },
    });

    return updated;
  }

  /**
   * Deactivate/Revoke platform user
   */
  static async deactivatePlatformUser(id: string, actorUserId?: string, actorPlatformRole?: PlatformRole) {
    const updated = await prisma.user.update({
      where: { id },
      data: { active: false, platformRole: null },
      select: { id: true, name: true, email: true, active: true },
    });

    await AuditService.log({
      userId: actorUserId,
      action: AuditAction.DELETE,
      entityType: 'PlatformUser',
      entityId: id,
      metadata: {
        actorPlatformRole,
        action: 'DEACTIVATE_AND_REVOKE_ROLE',
      },
    });

    return updated;
  }

  /**
   * Cross-tenant platform audit log queries with filtering and pagination
   */
  static async listPlatformAuditLogs(params: ListPlatformAuditParams) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {};

    if (params.action) {
      where.action = params.action;
    }
    if (params.entityType) {
      where.entityType = params.entityType;
    }
    if (params.restaurantId) {
      where.restaurantId = params.restaurantId;
    }
    if (params.userId) {
      where.userId = params.userId;
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {
        ...(params.startDate ? { gte: new Date(params.startDate) } : {}),
        ...(params.endDate ? { lte: new Date(params.endDate) } : {}),
      };
    }

    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true, platformRole: true },
          },
          restaurant: {
            select: { id: true, name: true, slug: true },
          },
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
   * SaaS Platform Settings
   */
  static async getPlatformSettings() {
    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          platformName: 'Aura SaaS',
          supportEmail: 'support@auramenu.com',
          defaultCurrency: 'EUR',
          defaultLanguage: 'en',
          maintenanceMode: false,
          allowRegistration: true,
        },
      });
    }
    return settings;
  }

  static async updatePlatformSettings(
    data: {
      platformName?: string;
      supportEmail?: string;
      defaultCurrency?: string;
      defaultLanguage?: string;
      maintenanceMode?: boolean;
      allowRegistration?: boolean;
      systemNotice?: string | null;
      featureFlags?: Prisma.InputJsonValue;
    },
    actorUserId?: string,
    actorPlatformRole?: PlatformRole
  ) {
    let settings = await prisma.platformSettings.findFirst();
    if (!settings) {
      settings = await prisma.platformSettings.create({
        data: {
          ...data,
          systemNotice: data.systemNotice || null,
        },
      });
    } else {
      settings = await prisma.platformSettings.update({
        where: { id: settings.id },
        data: {
          ...data,
          systemNotice: data.systemNotice !== undefined ? data.systemNotice : settings.systemNotice,
        },
      });
    }

    await AuditService.log({
      userId: actorUserId,
      action: AuditAction.UPDATE,
      entityType: 'PlatformSettings',
      entityId: settings.id,
      metadata: {
        actorPlatformRole,
        updatedFields: data,
      },
    });

    return settings;
  }
}
