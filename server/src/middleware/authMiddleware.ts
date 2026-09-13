import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Role, PlatformRole } from '@prisma/client';
import { prisma } from '../prisma';
import { Permission, hasPermission } from '../constants/permissions';
import { isValidUuid } from './validation';

import { getJwtSecret } from '../config';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  platformRole?: PlatformRole | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      userRole?: Role;
      isPlatformOverride?: boolean;
      userPermissions?: string[];
      userRestaurantId?: string;
    }
  }
}

/**
 * Validates the JWT bearer token from the Authorization header.
 */
export async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    res.status(401).json({
      success: false,
      errorCode: 'AUTH_REQUIRED',
      message: 'Access token required to access this resource.',
    });
    return;
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string; email: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, active: true, platformRole: true },
    });

    if (!user || !user.active) {
      res.status(401).json({
        success: false,
        errorCode: 'INVALID_TOKEN',
        message: 'The token belongs to an inactive or non-existent user.',
      });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole || null,
    };

    next();
  } catch (err: any) {
    res.status(401).json({
      success: false,
      errorCode: 'INVALID_TOKEN',
      message: 'Invalid or expired authentication token.',
    });
  }
}

/**
 * Checks that the authenticated user has a platform-level role (SaaS scope).
 */
export function requirePlatformRole(roles?: PlatformRole[] | PlatformRole) {
  const allowedRoles = roles ? (Array.isArray(roles) ? roles : [roles]) : [];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    if (!req.user.platformRole) {
      res.status(403).json({
        success: false,
        errorCode: 'PLATFORM_ACCESS_DENIED',
        message: 'Platform access denied. This resource requires a platform-level role.',
      });
      return;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.platformRole)) {
      res.status(403).json({
        success: false,
        errorCode: 'INSUFFICIENT_PLATFORM_ROLE',
        message: `Platform role ${req.user.platformRole} is not authorized for this operation. Requires: [${allowedRoles.join(', ')}]`,
      });
      return;
    }

    next();
  };
}

/**
 * Checks that the authenticated user is assigned to the target restaurant
 * and has one of the allowed roles.
 */
export function requireRestaurantAccess(roles?: Role[] | Role) {
  const roleHierarchy: Record<Role, number> = {
    STAFF: 1,
    MANAGER: 2,
    ADMIN: 3,
    OWNER: 4,
  };

  const allowedRolesArray = roles
    ? Array.isArray(roles)
      ? roles
      : [roles]
    : [];

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    try {
      // 1. Resolve the target restaurant id through the single canonical resolver.
      let targetRestaurantId = await resolveRestaurantId(req);

      if (!targetRestaurantId) {
        // If Platform Admin, they don't have default memberships; target must be explicit or picked
        if (req.user.platformRole === 'PLATFORM_ADMIN') {
          res.status(400).json({
            success: false,
            errorCode: 'RESTAURANT_CONTEXT_REQUIRED',
            message: 'Restaurant context is required for platform admin override.',
          });
          return;
        }

        // Fallback: check if the user belongs to any restaurant
        const defaultMembership = await prisma.userRestaurant.findFirst({
          where: { userId: req.user.id },
        });
        if (!defaultMembership) {
          res.status(403).json({
            success: false,
            errorCode: 'NO_RESTAURANT_ACCESS',
            message: 'User is not assigned to any restaurant.',
          });
          return;
        }
        targetRestaurantId = defaultMembership.restaurantId;
      }

      // Explicit Platform Admin Override: controlled tenant administration
      if (req.user.platformRole === 'PLATFORM_ADMIN') {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: targetRestaurantId },
        });
        if (!restaurant) {
          res.status(404).json({
            success: false,
            errorCode: 'RESTAURANT_NOT_FOUND',
            message: 'Target restaurant does not exist.',
          });
          return;
        }
        req.isPlatformOverride = true;
        req.userRole = Role.OWNER;
        return next();
      }

      // 2. Verify UserRestaurant membership
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user.id,
            restaurantId: targetRestaurantId,
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          errorCode: 'RESTAURANT_ACCESS_DENIED',
          message: 'You are not assigned to this restaurant tenant.',
        });
        return;
      }

      if (membership.status === 'DISABLED') {
        res.status(403).json({
          success: false,
          errorCode: 'STAFF_DISABLED',
          message: 'Your access to this restaurant has been disabled by management.',
        });
        return;
      }

      req.userRole = membership.role;

      // 3. Verify Role Hierarchy / Allowed Roles
      if (allowedRolesArray.length > 0) {
        const minRoleLevel = Math.min(...allowedRolesArray.map((r) => roleHierarchy[r] || 1));
        const userLevel = roleHierarchy[membership.role] || 0;

        if (userLevel < minRoleLevel && !allowedRolesArray.includes(membership.role)) {
          res.status(403).json({
            success: false,
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            message: `Role ${membership.role} is not authorized for this operation. Requires one of: [${allowedRolesArray.join(', ')}]`,
          });
          return;
        }
      }

      next();
    } catch (err: any) {
      console.error('Error in requireRestaurantAccess:', err);
      res.status(500).json({
        success: false,
        errorCode: 'AUTHORIZATION_ERROR',
        message: 'An error occurred while validating permissions.',
      });
    }
  };
}

/**
 * Normalizes an Express 5 route param (typed `string | string[]`) to a single string.
 */
function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * Canonical tenant identifier resolver.
 *
 * Resolves the target restaurant id from the request in priority order:
 *   1. explicit `:restaurantId` / `:id` route params
 *   2. `body.restaurantId`
 *   3. `query.restaurantId`
 *   4. `x-restaurant-id` header
 *   5. `/restaurants/:uuid` URL pattern (needed by mount-level middleware that
 *      runs before route params are populated)
 *   6. related-entity lookups (food/order/payment/table/category/media/customer/notification)
 *
 * Returns a valid UUID or `null`. A non-UUID (slug/email/name) is never returned
 * and is never converted — callers treat `null` as "no usable tenant context".
 */
export async function resolveRestaurantId(req: Request): Promise<string | null> {
  const fullUrl = `${req.baseUrl || ''}${req.path || ''}`;

  let target = asString(req.params.restaurantId);

  if (!target && (req.baseUrl.includes('/restaurants') || fullUrl.includes('/restaurants'))) {
    target = asString(req.params.id);
  }

  if (!target && req.body && typeof req.body.restaurantId === 'string') {
    target = req.body.restaurantId;
  }

  if (!target && req.query && typeof req.query.restaurantId === 'string') {
    target = req.query.restaurantId;
  }

  if (!target && req.headers && typeof req.headers['x-restaurant-id'] === 'string') {
    target = req.headers['x-restaurant-id'];
  }

  if (!target) {
    const match = (req.originalUrl || fullUrl).match(/\/restaurants\/([0-9a-fA-F-]{36})/);
    if (match) target = match[1];
  }

  const candidateId = asString(
    req.params.id || req.params.foodId || req.params.orderId || req.params.paymentId ||
    req.params.tableId || req.params.customerId || req.params.mediaId || req.params.categoryId ||
    req.params.notificationId
  );

  // Only perform entity lookups when the candidate id is already a valid UUID,
  // so a slug/email/name never reaches Prisma's UUID parser.
  if (!target && candidateId && isValidUuid(candidateId)) {
    if (req.baseUrl.includes('/foods') || fullUrl.includes('/foods')) {
      const food = await prisma.foodItem.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (food) target = food.restaurantId;
    } else if (req.baseUrl.includes('/orders') || fullUrl.includes('/orders')) {
      const order = await prisma.order.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (order) target = order.restaurantId;
    } else if (req.baseUrl.includes('/payments') || fullUrl.includes('/payments')) {
      const payment = await prisma.payment.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (payment) target = payment.restaurantId;
    } else if (req.baseUrl.includes('/tables') || fullUrl.includes('/tables')) {
      const table = await prisma.table.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (table) target = table.restaurantId;
    } else if (req.baseUrl.includes('/categories') || fullUrl.includes('/categories')) {
      const cat = await prisma.category.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (cat) target = cat.restaurantId;
    } else if (req.baseUrl.includes('/media') || fullUrl.includes('/media')) {
      const med = await prisma.media.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (med) target = med.restaurantId;
    } else if (req.baseUrl.includes('/qr') || fullUrl.includes('/qr')) {
      const qr = await prisma.qrCode.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (qr) target = qr.restaurantId;
    } else if (req.baseUrl.includes('/customers') || fullUrl.includes('/customers')) {
      const customer = await prisma.customer.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (customer) target = customer.restaurantId;
    } else if (req.baseUrl.includes('/notifications') || fullUrl.includes('/notifications')) {
      const notif = await prisma.notification.findUnique({ where: { id: candidateId }, select: { restaurantId: true } });
      if (notif) target = notif.restaurantId;
    }
  }

  // Never return a non-UUID (slug/email/name) as a tenant id.
  return target && isValidUuid(target) ? target : null;
}

/**
 * Checks that the authenticated user has an explicit permission within the target restaurant tenant.
 */
export function requirePermission(permission: Permission | string) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    try {
      let targetRestaurantId = await resolveRestaurantId(req);

      if (!targetRestaurantId) {
        if (req.user.platformRole === 'PLATFORM_ADMIN') {
          res.status(400).json({
            success: false,
            errorCode: 'RESTAURANT_CONTEXT_REQUIRED',
            message: 'Restaurant context is required for platform admin override.',
          });
          return;
        }

        const defaultMembership = await prisma.userRestaurant.findFirst({
          where: { userId: req.user.id },
        });
        if (!defaultMembership) {
          res.status(403).json({
            success: false,
            errorCode: 'NO_RESTAURANT_ACCESS',
            message: 'User is not assigned to any restaurant.',
          });
          return;
        }
        targetRestaurantId = defaultMembership.restaurantId;
      }

      req.userRestaurantId = targetRestaurantId;

      // Explicit Platform Admin Override
      if (req.user.platformRole === 'PLATFORM_ADMIN') {
        const restaurant = await prisma.restaurant.findUnique({
          where: { id: targetRestaurantId },
        });
        if (!restaurant) {
          res.status(404).json({
            success: false,
            errorCode: 'RESTAURANT_NOT_FOUND',
            message: 'Target restaurant does not exist.',
          });
          return;
        }
        req.isPlatformOverride = true;
        req.userRole = Role.OWNER;
        return next();
      }

      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user.id,
            restaurantId: targetRestaurantId,
          },
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          errorCode: 'RESTAURANT_ACCESS_DENIED',
          message: 'You are not assigned to this restaurant tenant.',
        });
        return;
      }

      if (membership.status === 'DISABLED') {
        res.status(403).json({
          success: false,
          errorCode: 'STAFF_DISABLED',
          message: 'Your access to this restaurant has been disabled by management.',
        });
        return;
      }

      req.userRole = membership.role;

      // Check if user has explicit relational permissions or template
      const assignedPermKeys = membership.permissions.map((p) => p.permission.key);
      req.userPermissions = assignedPermKeys;
      const customPerms = (membership.permissions.length > 0 || membership.jobTemplate !== null)
        ? assignedPermKeys
        : undefined;

      if (!hasPermission(membership.role, permission, customPerms)) {
        res.status(403).json({
          success: false,
          errorCode: 'INSUFFICIENT_PERMISSIONS',
          message: `Your role (${membership.role}) lacks the required '${permission}' permission for this restaurant.`,
        });
        return;
      }

      next();
    } catch (err: any) {
      console.error('Error in requirePermission:', err);
      res.status(500).json({
        success: false,
        errorCode: 'AUTHORIZATION_ERROR',
        message: 'An error occurred while validating permissions.',
      });
    }
  };
}

/**
 * Checks that the authenticated user has AT LEAST ONE of the specified permissions.
 */
export function requireAnyPermission(permissions: (Permission | string)[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        errorCode: 'AUTH_REQUIRED',
        message: 'Authentication required.',
      });
      return;
    }

    try {
      let targetRestaurantId = await resolveRestaurantId(req);

      if (!targetRestaurantId) {
        if (req.user.platformRole === 'PLATFORM_ADMIN') {
          res.status(400).json({
            success: false,
            errorCode: 'RESTAURANT_CONTEXT_REQUIRED',
            message: 'Restaurant context is required for platform admin override.',
          });
          return;
        }

        const defaultMembership = await prisma.userRestaurant.findFirst({
          where: { userId: req.user.id },
        });
        if (!defaultMembership) {
          res.status(403).json({
            success: false,
            errorCode: 'NO_RESTAURANT_ACCESS',
            message: 'User is not assigned to any restaurant.',
          });
          return;
        }
        targetRestaurantId = defaultMembership.restaurantId;
      }

      req.userRestaurantId = targetRestaurantId;

      if (req.user.platformRole === 'PLATFORM_ADMIN') {
        req.isPlatformOverride = true;
        req.userRole = Role.OWNER;
        return next();
      }

      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user.id,
            restaurantId: targetRestaurantId,
          },
        },
        include: {
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          errorCode: 'RESTAURANT_ACCESS_DENIED',
          message: 'You are not assigned to this restaurant tenant.',
        });
        return;
      }

      if (membership.status === 'DISABLED') {
        res.status(403).json({
          success: false,
          errorCode: 'STAFF_DISABLED',
          message: 'Your access to this restaurant has been disabled by management.',
        });
        return;
      }

      req.userRole = membership.role;
      const assignedPermKeys = membership.permissions.map((p) => p.permission.key);
      req.userPermissions = assignedPermKeys;
      const customPerms = (membership.permissions.length > 0 || membership.jobTemplate !== null)
        ? assignedPermKeys
        : undefined;

      const hasAny = permissions.some((p) => hasPermission(membership.role, p, customPerms));
      if (!hasAny) {
        res.status(403).json({
          success: false,
          errorCode: 'INSUFFICIENT_PERMISSIONS',
          message: `Your role (${membership.role}) lacks the required permission [${permissions.join(', ')}] for this restaurant.`,
        });
        return;
      }

      next();
    } catch (err: any) {
      console.error('Error in requireAnyPermission:', err);
      res.status(500).json({
        success: false,
        errorCode: 'AUTHORIZATION_ERROR',
        message: 'An error occurred while validating permissions.',
      });
    }
  };
}

