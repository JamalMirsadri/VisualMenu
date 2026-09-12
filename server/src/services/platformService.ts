import bcrypt from 'bcryptjs';
import { AuditAction, PlatformRole, Prisma } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from './auditService';
import { RestaurantProvisioningService } from './restaurantProvisioningService';
import { normalizeTheme, normalizePresentationMode } from '../routes/settingsRoutes';

export interface UpdatePlatformRestaurantInput {
  name?: string;
  slug?: string;
  logo?: string | null;
  favicon?: string | null;
  tagline?: string | null;
  legalName?: string | null;
  description?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  currency?: string;
  currencySymbol?: string;
  timezone?: string | null;
  defaultLanguage?: string;
  theme?: string;
  presentationMode?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  textStyle?: string;
  buttonStyle?: string;
  backgroundStyle?: string;
  cardStyle?: string;
  animationStyle?: string;
  categoryStyle?: string;
  foodInfoPosition?: string;
  progressIndicatorStyle?: string;
  environmentBackground?: string;
  tableSurface?: string;
  lightingPreset?: string;
  foodEntranceAnimation?: string;
  foodExitAnimation?: string;
  cameraMotion?: string;
  overlayStyle?: string;
  showPrices?: boolean;
  showCalories?: boolean;
  showPreparationTime?: boolean;
  showAllergens?: boolean;
  showIngredients?: boolean;
  showFavoriteButton?: boolean;
  showDetailsButton?: boolean;
  showOrderButton?: boolean;
  taxEnabled?: boolean;
  taxRate?: number;
  serviceChargeEnabled?: boolean;
  serviceChargeRate?: number;
}

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
        legalName: restaurant.legalName,
        city: restaurant.city,
        country: restaurant.country,
        timezone: restaurant.timezone,
        logo: restaurant.logo,
        coverImage: restaurant.coverImage,
        phone: restaurant.phone,
        email: restaurant.email,
        address: restaurant.address,
        website: restaurant.website,
        favicon: restaurant.favicon,
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
   * Update restaurant details & branding transactionally with before/after audit logging
   */
  static async updateRestaurantDetails(
    restaurantId: string,
    input: UpdatePlatformRestaurantInput,
    actorUserId: string,
    actorPlatformRole: PlatformRole,
    ipAddress?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.restaurant.findUnique({
        where: { id: restaurantId },
        include: { settings: true },
      });

      if (!current) {
        const err: any = new Error(`Restaurant with ID "${restaurantId}" not found.`);
        err.statusCode = 404;
        err.errorCode = 'RESTAURANT_NOT_FOUND';
        throw err;
      }

      // Slug validation & uniqueness check
      let newSlug: string | undefined;
      if (input.slug !== undefined && input.slug.trim() !== current.slug) {
        newSlug = RestaurantProvisioningService.normalizeSlug(input.slug);
        const conflict = await tx.restaurant.findUnique({
          where: { slug: newSlug },
        });
        if (conflict && conflict.id !== restaurantId) {
          const err: any = new Error(`A restaurant with slug "${newSlug}" already exists.`);
          err.statusCode = 409;
          err.errorCode = 'SLUG_CONFLICT';
          throw err;
        }
      }

      // Prepare restaurant updates
      const restaurantUpdateData: Prisma.RestaurantUpdateInput = {};
      if (input.name !== undefined) restaurantUpdateData.name = input.name.trim();
      if (newSlug !== undefined) restaurantUpdateData.slug = newSlug;
      if (input.tagline !== undefined) restaurantUpdateData.tagline = input.tagline ? input.tagline.trim() : null;
      if (input.legalName !== undefined) restaurantUpdateData.legalName = input.legalName ? input.legalName.trim() : null;
      if (input.description !== undefined) restaurantUpdateData.description = input.description ? input.description.trim() : null;
      if (input.logo !== undefined) restaurantUpdateData.logo = input.logo ? input.logo.trim() : null;
      if (input.favicon !== undefined) restaurantUpdateData.favicon = input.favicon ? input.favicon.trim() : null;
      if (input.phone !== undefined) restaurantUpdateData.phone = input.phone ? input.phone.trim() : null;
      if (input.email !== undefined) restaurantUpdateData.email = input.email ? input.email.trim().toLowerCase() : null;
      if (input.address !== undefined) restaurantUpdateData.address = input.address ? input.address.trim() : null;
      if (input.city !== undefined) restaurantUpdateData.city = input.city ? input.city.trim() : null;
      if (input.country !== undefined) restaurantUpdateData.country = input.country ? input.country.trim() : null;
      if (input.currency !== undefined) restaurantUpdateData.currency = input.currency.trim().toUpperCase();
      if (input.currencySymbol !== undefined) {
        restaurantUpdateData.currencySymbol = input.currencySymbol.trim();
      } else if (input.currency !== undefined) {
        restaurantUpdateData.currencySymbol = input.currency === 'USD' ? '$' : input.currency === 'GBP' ? '£' : '€';
      }
      if (input.timezone !== undefined) restaurantUpdateData.timezone = input.timezone ? input.timezone.trim() : 'UTC';
      if (input.defaultLanguage !== undefined) restaurantUpdateData.defaultLanguage = input.defaultLanguage.trim().toLowerCase();

      const updatedRestaurant = await tx.restaurant.update({
        where: { id: restaurantId },
        data: restaurantUpdateData,
      });

      // Prepare settings updates
      const settingsUpdateData: Prisma.RestaurantSettingsUpdateInput = {};
      if (input.theme !== undefined) settingsUpdateData.theme = normalizeTheme(input.theme);
      if (input.presentationMode !== undefined) settingsUpdateData.presentationMode = normalizePresentationMode(input.presentationMode);
      if (input.primaryColor !== undefined) settingsUpdateData.primaryColor = input.primaryColor;
      if (input.secondaryColor !== undefined) settingsUpdateData.secondaryColor = input.secondaryColor;
      if (input.accentColor !== undefined) settingsUpdateData.accentColor = input.accentColor;
      if (input.defaultLanguage !== undefined) settingsUpdateData.language = input.defaultLanguage.trim().toLowerCase();
      if (input.textStyle !== undefined) settingsUpdateData.textStyle = input.textStyle.toUpperCase();
      if (input.buttonStyle !== undefined) settingsUpdateData.buttonStyle = input.buttonStyle.toUpperCase();
      if (input.backgroundStyle !== undefined) settingsUpdateData.backgroundStyle = input.backgroundStyle.toUpperCase();
      if (input.cardStyle !== undefined) settingsUpdateData.cardStyle = input.cardStyle.toUpperCase();
      if (input.animationStyle !== undefined) settingsUpdateData.animationStyle = input.animationStyle.toUpperCase();
      if (input.categoryStyle !== undefined) settingsUpdateData.categoryStyle = input.categoryStyle.toUpperCase();
      if (input.foodInfoPosition !== undefined) settingsUpdateData.foodInfoPosition = input.foodInfoPosition.toUpperCase();
      if (input.progressIndicatorStyle !== undefined) settingsUpdateData.progressIndicatorStyle = input.progressIndicatorStyle.toUpperCase();
      if (input.environmentBackground !== undefined) settingsUpdateData.environmentBackground = input.environmentBackground;
      if (input.tableSurface !== undefined) settingsUpdateData.tableSurface = input.tableSurface;
      if (input.lightingPreset !== undefined) settingsUpdateData.lightingPreset = input.lightingPreset.toUpperCase();
      if (input.foodEntranceAnimation !== undefined) settingsUpdateData.foodEntranceAnimation = input.foodEntranceAnimation.toUpperCase();
      if (input.foodExitAnimation !== undefined) settingsUpdateData.foodExitAnimation = input.foodExitAnimation.toUpperCase();
      if (input.cameraMotion !== undefined) settingsUpdateData.cameraMotion = input.cameraMotion.toUpperCase();
      if (input.overlayStyle !== undefined) settingsUpdateData.overlayStyle = input.overlayStyle.toUpperCase();
      if (input.showPrices !== undefined) settingsUpdateData.showPrices = Boolean(input.showPrices);
      if (input.showCalories !== undefined) settingsUpdateData.showCalories = Boolean(input.showCalories);
      if (input.showPreparationTime !== undefined) settingsUpdateData.showPreparationTime = Boolean(input.showPreparationTime);
      if (input.showAllergens !== undefined) settingsUpdateData.showAllergens = Boolean(input.showAllergens);
      if (input.showIngredients !== undefined) settingsUpdateData.showIngredients = Boolean(input.showIngredients);
      if (input.showFavoriteButton !== undefined) settingsUpdateData.showFavoriteButton = Boolean(input.showFavoriteButton);
      if (input.showDetailsButton !== undefined) settingsUpdateData.showDetailsButton = Boolean(input.showDetailsButton);
      if (input.showOrderButton !== undefined) settingsUpdateData.showOrderButton = Boolean(input.showOrderButton);
      if (input.taxEnabled !== undefined) settingsUpdateData.taxEnabled = Boolean(input.taxEnabled);
      if (input.taxRate !== undefined) settingsUpdateData.taxRate = input.taxRate;
      if (input.serviceChargeEnabled !== undefined) settingsUpdateData.serviceChargeEnabled = Boolean(input.serviceChargeEnabled);
      if (input.serviceChargeRate !== undefined) settingsUpdateData.serviceChargeRate = input.serviceChargeRate;

      const updatedSettings = await tx.restaurantSettings.upsert({
        where: { restaurantId },
        update: settingsUpdateData,
        create: {
          restaurantId,
          theme: input.theme ? normalizeTheme(input.theme) : 'DARK_LUXURY',
          presentationMode: input.presentationMode ? normalizePresentationMode(input.presentationMode) : 'INDIVIDUAL_VIDEO',
          primaryColor: input.primaryColor || '#eab308',
          secondaryColor: input.secondaryColor || '#d97706',
          accentColor: input.accentColor || '#f59e0b',
          language: input.defaultLanguage || 'en',
          textStyle: input.textStyle ? input.textStyle.toUpperCase() : 'SERIF',
          buttonStyle: input.buttonStyle ? input.buttonStyle.toUpperCase() : 'PILL',
          cardStyle: input.cardStyle ? input.cardStyle.toUpperCase() : 'GLASSMORPHISM',
          categoryStyle: input.categoryStyle ? input.categoryStyle.toUpperCase() : 'PILLS',
          backgroundStyle: input.backgroundStyle ? input.backgroundStyle.toUpperCase() : 'DARK_BLUR',
          animationStyle: input.animationStyle ? input.animationStyle.toUpperCase() : 'CINEMATIC',
          foodInfoPosition: input.foodInfoPosition ? input.foodInfoPosition.toUpperCase() : 'BOTTOM_OVERLAY',
          progressIndicatorStyle: input.progressIndicatorStyle ? input.progressIndicatorStyle.toUpperCase() : 'BAR',
          lightingPreset: input.lightingPreset ? input.lightingPreset.toUpperCase() : 'WARM',
          environmentBackground: input.environmentBackground || 'DARK_STUDIO',
          tableSurface: input.tableSurface || 'DARK_MARBLE',
          foodEntranceAnimation: input.foodEntranceAnimation ? input.foodEntranceAnimation.toUpperCase() : 'SCALE',
          foodExitAnimation: input.foodExitAnimation ? input.foodExitAnimation.toUpperCase() : 'FADE',
          cameraMotion: input.cameraMotion ? input.cameraMotion.toUpperCase() : 'SUBTLE_ZOOM',
          overlayStyle: input.overlayStyle ? input.overlayStyle.toUpperCase() : 'GRADIENT_BOTTOM',
          showPrices: input.showPrices !== undefined ? Boolean(input.showPrices) : true,
          showCalories: input.showCalories !== undefined ? Boolean(input.showCalories) : true,
          showPreparationTime: input.showPreparationTime !== undefined ? Boolean(input.showPreparationTime) : true,
          showAllergens: input.showAllergens !== undefined ? Boolean(input.showAllergens) : true,
          showIngredients: input.showIngredients !== undefined ? Boolean(input.showIngredients) : true,
          showFavoriteButton: input.showFavoriteButton !== undefined ? Boolean(input.showFavoriteButton) : true,
          showDetailsButton: input.showDetailsButton !== undefined ? Boolean(input.showDetailsButton) : true,
          showOrderButton: input.showOrderButton !== undefined ? Boolean(input.showOrderButton) : true,
          taxEnabled: input.taxEnabled !== undefined ? Boolean(input.taxEnabled) : false,
          taxRate: input.taxRate !== undefined ? input.taxRate : 0.0,
          serviceChargeEnabled: input.serviceChargeEnabled !== undefined ? Boolean(input.serviceChargeEnabled) : false,
          serviceChargeRate: input.serviceChargeRate !== undefined ? input.serviceChargeRate : 0.0,
        },
      });

      // Calculate before/after diff for audit logging
      const before: Record<string, any> = {};
      const after: Record<string, any> = {};

      const restaurantKeys = [
        'name',
        'slug',
        'tagline',
        'legalName',
        'description',
        'logo',
        'favicon',
        'phone',
        'email',
        'address',
        'city',
        'country',
        'currency',
        'currencySymbol',
        'timezone',
        'defaultLanguage',
      ] as const;

      for (const key of restaurantKeys) {
        if ((input as any)[key] !== undefined) {
          const oldVal = (current as any)[key] ?? null;
          const newVal = (updatedRestaurant as any)[key] ?? null;
          if (oldVal !== newVal) {
            before[key] = oldVal;
            after[key] = newVal;
          }
        }
      }

      const settingsKeys = [
        'theme',
        'presentationMode',
        'primaryColor',
        'secondaryColor',
        'accentColor',
        'textStyle',
        'buttonStyle',
        'backgroundStyle',
        'cardStyle',
        'animationStyle',
        'categoryStyle',
        'foodInfoPosition',
        'progressIndicatorStyle',
        'environmentBackground',
        'tableSurface',
        'lightingPreset',
        'foodEntranceAnimation',
        'foodExitAnimation',
        'cameraMotion',
        'overlayStyle',
        'showPrices',
        'showCalories',
        'showPreparationTime',
        'showAllergens',
        'showIngredients',
        'showFavoriteButton',
        'showDetailsButton',
        'showOrderButton',
        'taxEnabled',
        'taxRate',
        'serviceChargeEnabled',
        'serviceChargeRate',
      ] as const;

      for (const key of settingsKeys) {
        if ((input as any)[key] !== undefined) {
          const oldVal = current.settings ? (current.settings as any)[key] ?? null : null;
          const newVal = (updatedSettings as any)[key] ?? null;
          if (String(oldVal) !== String(newVal)) {
            before[`settings.${key}`] = oldVal;
            after[`settings.${key}`] = newVal;
          }
        }
      }

      // Record AuditLog
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: actorUserId,
          action: AuditAction.UPDATE,
          entityType: 'Restaurant',
          entityId: restaurantId,
          actorPlatformRole,
          ipAddress: ipAddress || null,
          metadata: {
            action: 'UPDATE_RESTAURANT',
            before,
            after,
            updatedFields: Object.keys(after),
          },
        },
      });

      return {
        restaurant: updatedRestaurant,
        settings: updatedSettings,
      };
    });
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
