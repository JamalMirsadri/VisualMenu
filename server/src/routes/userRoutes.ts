import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requirePermission } from '../middleware/authMiddleware';

export const userRouter = Router();

/**
 * GET /api/restaurants/:restaurantId/users
 * Lists all assigned team members for the restaurant.
 */
userRouter.get(
  '/restaurants/:restaurantId/users',
  validateUuidParams(['restaurantId']),
  requirePermission('MANAGE_USERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { page, limit } = req.query;
      const isPaginated = page !== undefined || limit !== undefined;
      const pageNum = Math.max(1, Number(page) || 1);
      const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
      const skip = isPaginated ? (pageNum - 1) * limitNum : undefined;
      const take = isPaginated ? limitNum : undefined;

      const [total, memberships] = await Promise.all([
        prisma.userRestaurant.count({ where: { restaurantId } }),
        prisma.userRestaurant.findMany({
          where: { restaurantId },
          skip,
          take,
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                active: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
      ]);

      const members = memberships.map((m) => ({
        id: m.user.id,
        membershipId: m.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        active: m.user.active,
        joinedAt: m.createdAt,
      }));

      const responsePayload: any = {
        success: true,
        data: members,
      };

      if (isPaginated) {
        responsePayload.pagination = {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum) || 1,
        };
      }

      res.status(200).json(responsePayload);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/users
 * Invites / Creates a user and assigns them to the restaurant.
 */
userRouter.post(
  '/restaurants/:restaurantId/users',
  validateUuidParams(['restaurantId']),
  requirePermission('MANAGE_USERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { email, name, role, password } = req.body;

      if (!email || typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'A valid email address is required.',
        });
        return;
      }

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Full name is required.',
        });
        return;
      }

      if (!role || !Object.values(Role).includes(role as Role)) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: `Role must be one of: ${Object.values(Role).join(', ')}`,
        });
        return;
      }

      const assignedRole = role as Role;
      const callerRole = req.userRole;

      // Role elevation protection: ADMIN cannot assign OWNER or ADMIN
      if (callerRole === Role.ADMIN && (assignedRole === Role.OWNER || assignedRole === Role.ADMIN)) {
        res.status(403).json({
          success: false,
          errorCode: 'ROLE_ELEVATION_DENIED',
          message: 'Administrators cannot assign OWNER or ADMIN roles. An OWNER must perform this action.',
        });
        return;
      }

      // Check if user already exists globally
      const normalizedEmail = email.trim().toLowerCase();
      let user = await prisma.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        const tempPassword = password || 'Password123!';
        const passwordHash = await bcrypt.hash(tempPassword, 10);

        user = await prisma.user.create({
          data: {
            email: normalizedEmail,
            name: name.trim(),
            passwordHash,
            active: true,
          },
        });
      }

      // Check if already member in this restaurant
      const existingMembership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: user.id,
            restaurantId,
          },
        },
      });

      if (existingMembership) {
        res.status(409).json({
          success: false,
          errorCode: 'ALREADY_MEMBER',
          message: 'This user is already a member of this restaurant.',
        });
        return;
      }

      // Create membership
      const membership = await prisma.userRestaurant.create({
        data: {
          userId: user.id,
          restaurantId,
          role: assignedRole,
        },
        include: { user: true },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'UserRestaurant',
        entityId: membership.id,
        newValues: {
          email: user.email,
          role: assignedRole,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Team member added successfully.',
        data: {
          id: user.id,
          membershipId: membership.id,
          email: user.email,
          name: user.name,
          role: membership.role,
          active: user.active,
          joinedAt: membership.createdAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/restaurants/:restaurantId/users/:userId
 * Updates member role or active state.
 */
userRouter.put(
  '/restaurants/:restaurantId/users/:userId',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('MANAGE_USERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const { role, active } = req.body;

      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
      });

      if (!membership) {
        res.status(404).json({
          success: false,
          errorCode: 'MEMBER_NOT_FOUND',
          message: 'User is not a member of this restaurant.',
        });
        return;
      }

      // Protection: ADMIN cannot modify an OWNER
      if (req.userRole === Role.ADMIN && membership.role === Role.OWNER) {
        res.status(403).json({
          success: false,
          errorCode: 'FORBIDDEN',
          message: 'Administrators cannot modify an Owner account.',
        });
        return;
      }

      // If demoting an OWNER, verify another owner exists
      if (role && role !== Role.OWNER && membership.role === Role.OWNER) {
        const ownerCount = await prisma.userRestaurant.count({
          where: { restaurantId, role: Role.OWNER },
        });
        if (ownerCount <= 1) {
          res.status(400).json({
            success: false,
            errorCode: 'SOLE_OWNER_DEMOTION',
            message: 'Cannot demote the sole Owner. Assign another Owner first.',
          });
          return;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        let updatedMembership = membership;
        if (role && Object.values(Role).includes(role)) {
          updatedMembership = await tx.userRestaurant.update({
            where: {
              userId_restaurantId: {
                userId,
                restaurantId,
              },
            },
            data: { role },
          });
        }

        if (active !== undefined) {
          await tx.user.update({
            where: { id: userId },
            data: { active: Boolean(active) },
          });
        }

        return updatedMembership;
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'UserRestaurant',
        entityId: updated.id,
        oldValues: { role: membership.role },
        newValues: { role: updated.role, active },
      });

      res.status(200).json({
        success: true,
        message: 'Member updated successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/restaurants/:restaurantId/users/:userId
 * Removes a member from the restaurant.
 */
userRouter.delete(
  '/restaurants/:restaurantId/users/:userId',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('MANAGE_USERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;

      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
      });

      if (!membership) {
        res.status(404).json({
          success: false,
          errorCode: 'MEMBER_NOT_FOUND',
          message: 'Member not found in this restaurant.',
        });
        return;
      }

      if (membership.role === Role.OWNER) {
        const ownerCount = await prisma.userRestaurant.count({
          where: { restaurantId, role: Role.OWNER },
        });
        if (ownerCount <= 1) {
          res.status(400).json({
            success: false,
            errorCode: 'SOLE_OWNER_REMOVAL',
            message: 'Cannot remove the sole Owner of a restaurant.',
          });
          return;
        }
      }

      await prisma.userRestaurant.delete({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'UserRestaurant',
        entityId: membership.id,
        oldValues: membership,
      });

      res.status(200).json({
        success: true,
        message: 'Member removed from restaurant.',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/users/:userId/reset-password
 * Resets user password by owner or authorized administrator.
 */
userRouter.post(
  '/restaurants/:restaurantId/users/:userId/reset-password',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('MANAGE_USERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const { newPassword } = req.body;

      let finalPassword = newPassword;
      let generatedTempPassword: string | undefined = undefined;

      if (!finalPassword) {
        generatedTempPassword = `Tmp_${crypto.randomUUID().slice(0, 8)}_9!`;
        finalPassword = generatedTempPassword;
      } else if (typeof finalPassword !== 'string' || finalPassword.length < 8) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'New password must be at least 8 characters.',
        });
        return;
      }

      // Check member belongs to restaurant
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId,
            restaurantId,
          },
        },
      });

      if (!membership) {
        res.status(404).json({
          success: false,
          errorCode: 'MEMBER_NOT_FOUND',
          message: 'Member not found in this restaurant.',
        });
        return;
      }

      const passwordHash = await bcrypt.hash(finalPassword, 10);
      await prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'User',
        entityId: userId,
        metadata: { action: 'password_reset' },
      });

      res.status(200).json({
        success: true,
        message: 'User password reset successfully.',
        data: {
          temporaryPassword: generatedTempPassword,
        },
      });

    } catch (err) {
      next(err);
    }
  }
);
