import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Role, PlatformRole, AuditAction, StaffStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from './auditService';
import {
  PermissionKey,
  PERMISSION_CATALOG,
  ROLE_TEMPLATES,
  RoleTemplate,
  hasPermission,
} from '../constants/permissions';

const JWT_SECRET = process.env.JWT_SECRET || 'aura_super_secure_jwt_secret_dev_2026_key';

export interface CreateStaffInput {
  email: string;
  name: string;
  phone?: string;
  role: Role;
  jobTemplate?: string;
  permissions?: string[];
  password?: string;
}

export class StaffService {
  /**
   * Lists all staff members and pending invitations for a restaurant
   */
  static async listStaff(restaurantId: string) {
    const [memberships, invitations] = await Promise.all([
      prisma.userRestaurant.findMany({
        where: { restaurantId },
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
          permissions: {
            include: {
              permission: {
                select: { key: true, group: true, label: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.staffInvitation.findMany({
        where: { restaurantId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const activeMembers = memberships.map((m) => {
      const explicitPermissions = m.permissions.map((p) => p.permission.key);
      return {
        id: m.user.id,
        membershipId: m.id,
        email: m.user.email,
        name: m.user.name,
        role: m.role,
        jobTemplate: m.jobTemplate,
        status: m.status,
        active: m.status === StaffStatus.ACTIVE && m.user.active,
        permissions: explicitPermissions,
        joinedAt: m.createdAt,
      };
    });

    const pendingInvitations = invitations.map((inv) => {
      let status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' = 'PENDING';
      if (inv.acceptedAt) status = 'ACCEPTED';
      else if (inv.revokedAt) status = 'REVOKED';
      else if (new Date() > new Date(inv.expiresAt)) status = 'EXPIRED';

      return {
        id: inv.id,
        invitedEmail: inv.invitedEmail,
        invitedName: inv.invitedName,
        phone: inv.phone,
        role: inv.role,
        jobTemplate: inv.jobTemplate,
        stagedPermissions: inv.stagedPermissions,
        status,
        expiresAt: inv.expiresAt,
        acceptedAt: inv.acceptedAt,
        revokedAt: inv.revokedAt,
        createdAt: inv.createdAt,
      };
    });

    return {
      members: activeMembers,
      invitations: pendingInvitations,
    };
  }

  /**
   * Helper to locate membership by either userId or userRestaurantId
   */
  private static async findMembership(restaurantId: string, identifier: string) {
    let membership = await prisma.userRestaurant.findUnique({
      where: {
        userId_restaurantId: {
          userId: identifier,
          restaurantId,
        },
      },
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
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!membership) {
      membership = await prisma.userRestaurant.findFirst({
        where: {
          id: identifier,
          restaurantId,
        },
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
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      });
    }

    return membership;
  }

  /**
   * Retrieves full details and effective permissions for a single staff member
   */
  static async getStaffDetails(restaurantId: string, userId: string) {
    const membership = await this.findMembership(restaurantId, userId);

    if (!membership) {
      const err: any = new Error('Staff member not found in this restaurant.');
      err.statusCode = 404;
      err.errorCode = 'STAFF_NOT_FOUND';
      throw err;
    }

    const explicitPermissions = membership.permissions.map((p) => p.permission.key);

    return {
      id: membership.user.id,
      membershipId: membership.id,
      email: membership.user.email,
      name: membership.user.name,
      role: membership.role,
      jobTemplate: membership.jobTemplate,
      status: membership.status,
      active: membership.status === StaffStatus.ACTIVE && membership.user.active,
      permissions: explicitPermissions,
      joinedAt: membership.createdAt,
    };
  }

  /**
   * Creates an employee directly or issues a cryptographic staff invitation
   */
  static async createOrInviteStaff(
    restaurantId: string,
    input: CreateStaffInput,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    if (!input.email || !input.email.includes('@')) {
      const err: any = new Error('A valid email address is required.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_INPUT';
      throw err;
    }

    if (!input.name || !input.name.trim()) {
      const err: any = new Error('Full name is required.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_INPUT';
      throw err;
    }

    if (!input.role || !Object.values(Role).includes(input.role)) {
      const err: any = new Error(`Role must be one of: ${Object.values(Role).join(', ')}`);
      err.statusCode = 400;
      err.errorCode = 'INVALID_ROLE';
      throw err;
    }

    const normalizedEmail = input.email.trim().toLowerCase();

    // Check if user is already a member of this restaurant
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        userRestaurants: {
          where: { restaurantId },
        },
      },
    });

    if (existingUser && existingUser.userRestaurants.length > 0) {
      const err: any = new Error('This user is already a team member of this restaurant.');
      err.statusCode = 409;
      err.errorCode = 'ALREADY_MEMBER';
      throw err;
    }

    // Determine initial permission keys: explicit permissions provided, or role template defaults
    let initialPermissions = input.permissions;
    if (!initialPermissions || initialPermissions.length === 0) {
      if (input.jobTemplate && ROLE_TEMPLATES[input.jobTemplate as RoleTemplate]) {
        initialPermissions = ROLE_TEMPLATES[input.jobTemplate as RoleTemplate];
      } else {
        initialPermissions = [];
      }
    }

    // Generate secure random 32-byte hex invitation token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // If a direct password is provided, create the user & membership immediately
    if (input.password && input.password.length >= 8) {
      const passwordHash = await bcrypt.hash(input.password, 10);

      const result = await prisma.$transaction(async (tx) => {
        let user = existingUser;
        if (!user) {
          user = await tx.user.create({
            data: {
              email: normalizedEmail,
              name: input.name.trim(),
              passwordHash,
              active: true,
            },
            include: { userRestaurants: true },
          });
        }

        const membership = await tx.userRestaurant.create({
          data: {
            userId: user.id,
            restaurantId,
            role: input.role,
            jobTemplate: input.jobTemplate || null,
            status: StaffStatus.ACTIVE,
          },
        });

        // Grant explicit permissions if non-owner
        if (input.role !== Role.OWNER && initialPermissions && initialPermissions.length > 0) {
          const dbPermissions = await tx.permission.findMany({
            where: { key: { in: initialPermissions } },
          });

          if (dbPermissions.length > 0) {
            await tx.userRestaurantPermission.createMany({
              data: dbPermissions.map((p) => ({
                userRestaurantId: membership.id,
                permissionId: p.id,
              })),
              skipDuplicates: true,
            });
          }
        }

        // Create invitation marked accepted for record keeping
        const invitation = await tx.staffInvitation.create({
          data: {
            restaurantId,
            userId: user.id,
            invitedEmail: normalizedEmail,
            invitedName: input.name.trim(),
            phone: input.phone || null,
            role: input.role,
            jobTemplate: input.jobTemplate || null,
            stagedPermissions: initialPermissions || [],
            tokenHash,
            expiresAt,
            acceptedAt: new Date(),
            invitedByUserId: actorUserId,
          },
        });

        await tx.auditLog.create({
          data: {
            restaurantId,
            userId: actorUserId,
            action: AuditAction.STAFF_CREATE,
            entityType: 'UserRestaurant',
            entityId: membership.id,
            actorPlatformRole: actorPlatformRole || null,
            ipAddress: ipAddress || null,
            metadata: {
              email: normalizedEmail,
              role: input.role,
              jobTemplate: input.jobTemplate,
              permissionsCount: initialPermissions?.length || 0,
            },
          },
        });

        return { user, membership, invitation };
      });

      return {
        member: {
          id: result.user.id,
          membershipId: result.membership.id,
          email: result.user.email,
          name: result.user.name,
          role: result.membership.role,
          jobTemplate: result.membership.jobTemplate,
          status: result.membership.status,
          active: true,
          permissions: initialPermissions || [],
          joinedAt: result.membership.createdAt,
        },
        invitation: {
          id: result.invitation.id,
          rawToken,
          expiresAt,
          onboardingUrl: `/staff/onboarding/${rawToken}`,
        },
      };
    }

    // Invitation flow (without direct password)
    const invitation = await prisma.$transaction(async (tx) => {
      // Revoke any existing pending invitations for this email in this restaurant
      await tx.staffInvitation.updateMany({
        where: {
          restaurantId,
          invitedEmail: normalizedEmail,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });

      const inv = await tx.staffInvitation.create({
        data: {
          restaurantId,
          invitedEmail: normalizedEmail,
          invitedName: input.name.trim(),
          phone: input.phone || null,
          role: input.role,
          jobTemplate: input.jobTemplate || null,
          stagedPermissions: initialPermissions || [],
          tokenHash,
          expiresAt,
          invitedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: actorUserId,
          action: AuditAction.STAFF_INVITATION_CREATE,
          entityType: 'StaffInvitation',
          entityId: inv.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            invitedEmail: normalizedEmail,
            role: input.role,
            jobTemplate: input.jobTemplate,
            stagedPermissionsCount: initialPermissions?.length || 0,
          },
        },
      });

      return inv;
    });

    return {
      invitation: {
        id: invitation.id,
        rawToken,
        invitedEmail: invitation.invitedEmail,
        invitedName: invitation.invitedName,
        role: invitation.role,
        jobTemplate: invitation.jobTemplate,
        expiresAt: invitation.expiresAt,
        onboardingUrl: `/staff/onboarding/${rawToken}`,
      },
    };
  }

  /**
   * Updates an employee's permissions atomically with before/after audit tracking
   */
  static async updateStaffPermissions(
    restaurantId: string,
    targetUserId: string,
    permissionKeys: string[],
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string,
    jobTemplate?: string | null
  ) {
    const membership = await this.findMembership(restaurantId, targetUserId);

    if (!membership) {
      const err: any = new Error('Staff member not found in this restaurant.');
      err.statusCode = 404;
      err.errorCode = 'STAFF_NOT_FOUND';
      throw err;
    }

    // Protection: OWNER role inherently has full access
    if (membership.role === Role.OWNER) {
      const err: any = new Error('Restaurant Owners have full implicit permissions that cannot be restricted.');
      err.statusCode = 400;
      err.errorCode = 'CANNOT_RESTRICT_OWNER';
      throw err;
    }

    const previousKeys = membership.permissions.map((p) => p.permission.key);

    // Resolve Permission records from DB
    const dbPermissions = await prisma.permission.findMany({
      where: { key: { in: permissionKeys } },
    });

    const updated = await prisma.$transaction(async (tx) => {
      // Delete old permissions
      await tx.userRestaurantPermission.deleteMany({
        where: { userRestaurantId: membership.id },
      });

      // Insert new permissions
      if (dbPermissions.length > 0) {
        await tx.userRestaurantPermission.createMany({
          data: dbPermissions.map((p) => ({
            userRestaurantId: membership.id,
            permissionId: p.id,
          })),
        });
      }

      // Audit permission grant / update
      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: actorUserId,
          action: AuditAction.STAFF_PERMISSION_GRANT,
          entityType: 'UserRestaurantPermission',
          entityId: membership.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            targetUserId,
            previousPermissions: previousKeys,
            newPermissions: dbPermissions.map((p) => p.key),
            added: dbPermissions.map((p) => p.key).filter((k) => !previousKeys.includes(k)),
            removed: previousKeys.filter((k) => !dbPermissions.some((p) => p.key === k)),
          },
        },
      });

      // Update jobTemplate if provided
      if (jobTemplate !== undefined) {
        await tx.userRestaurant.update({
          where: { id: membership.id },
          data: { jobTemplate },
        });
      }

      return tx.userRestaurant.findUnique({
        where: { id: membership.id },
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      });
    });

    return {
      success: true,
      permissions: updated?.permissions.map((p) => p.permission.key) || [],
      jobTemplate: updated?.jobTemplate,
    };
  }

  /**
   * Changes employee active / disabled status within this specific restaurant
   */
  static async updateStaffStatus(
    restaurantId: string,
    targetUserId: string,
    status: StaffStatus,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const membership = await this.findMembership(restaurantId, targetUserId);

    if (!membership) {
      const err: any = new Error('Staff member not found in this restaurant.');
      err.statusCode = 404;
      err.errorCode = 'STAFF_NOT_FOUND';
      throw err;
    }

    // Sole owner protection
    if (membership.role === Role.OWNER && status === StaffStatus.DISABLED) {
      const ownerCount = await prisma.userRestaurant.count({
        where: { restaurantId, role: Role.OWNER, status: StaffStatus.ACTIVE },
      });
      if (ownerCount <= 1) {
        const err: any = new Error('Cannot disable the sole active Owner of a restaurant.');
        err.statusCode = 400;
        err.errorCode = 'SOLE_OWNER_PROTECTION';
        throw err;
      }
    }

    const updated = await prisma.userRestaurant.update({
      where: { id: membership.id },
      data: { status },
    });

    await AuditService.log({
      restaurantId,
      userId: actorUserId,
      action: status === StaffStatus.ACTIVE ? AuditAction.STAFF_ENABLE : AuditAction.STAFF_DISABLE,
      entityType: 'UserRestaurant',
      entityId: membership.id,
      metadata: {
        targetUserId,
        previousStatus: membership.status,
        newStatus: status,
        actorPlatformRole,
      },
    });

    return {
      success: true,
      status: updated.status,
    };
  }

  /**
   * Removes employee membership from this restaurant. Global User account survives untouched.
   */
  static async removeStaff(
    restaurantId: string,
    targetUserId: string,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const membership = await this.findMembership(restaurantId, targetUserId);

    if (!membership) {
      const err: any = new Error('Staff member not found in this restaurant.');
      err.statusCode = 404;
      err.errorCode = 'STAFF_NOT_FOUND';
      throw err;
    }

    // Sole owner protection
    if (membership.role === Role.OWNER) {
      const ownerCount = await prisma.userRestaurant.count({
        where: { restaurantId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        const err: any = new Error('Cannot remove the sole Owner of a restaurant.');
        err.statusCode = 400;
        err.errorCode = 'SOLE_OWNER_REMOVAL';
        throw err;
      }
    }

    await prisma.userRestaurant.delete({
      where: { id: membership.id },
    });

    await AuditService.log({
      restaurantId,
      userId: actorUserId,
      action: AuditAction.STAFF_REMOVE,
      entityType: 'UserRestaurant',
      entityId: membership.id,
      metadata: {
        targetUserId,
        removedRole: membership.role,
        actorPlatformRole,
      },
    });

    return { success: true, message: 'Staff member removed from restaurant.' };
  }

  /**
   * Resends staff invitation, revoking old pending tokens
   */
  static async resendStaffInvitation(
    restaurantId: string,
    invitationId: string,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const existing = await prisma.staffInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!existing || existing.restaurantId !== restaurantId) {
      const err: any = new Error('Staff invitation not found.');
      err.statusCode = 404;
      err.errorCode = 'INVITATION_NOT_FOUND';
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const updated = await prisma.$transaction(async (tx) => {
      // Revoke old
      await tx.staffInvitation.update({
        where: { id: existing.id },
        data: { revokedAt: new Date() },
      });

      // Create new
      const newInv = await tx.staffInvitation.create({
        data: {
          restaurantId,
          invitedEmail: existing.invitedEmail,
          invitedName: existing.invitedName,
          phone: existing.phone,
          role: existing.role,
          jobTemplate: existing.jobTemplate,
          stagedPermissions: existing.stagedPermissions,
          tokenHash,
          expiresAt,
          invitedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: actorUserId,
          action: AuditAction.STAFF_INVITATION_RESEND,
          entityType: 'StaffInvitation',
          entityId: newInv.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            invitedEmail: existing.invitedEmail,
            role: existing.role,
          },
        },
      });

      return newInv;
    });

    return {
      invitation: {
        id: updated.id,
        rawToken,
        expiresAt: updated.expiresAt,
        onboardingUrl: `/staff/onboarding/${rawToken}`,
      },
    };
  }

  /**
   * Revokes an active pending staff invitation
   */
  static async revokeStaffInvitation(
    restaurantId: string,
    invitationId: string,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const updated = await prisma.staffInvitation.updateMany({
      where: {
        id: invitationId,
        restaurantId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (updated.count === 0) {
      const err: any = new Error('Active invitation not found or already processed.');
      err.statusCode = 404;
      err.errorCode = 'INVITATION_NOT_FOUND';
      throw err;
    }

    await AuditService.log({
      restaurantId,
      userId: actorUserId,
      action: AuditAction.STAFF_INVITATION_REVOKE,
      entityType: 'StaffInvitation',
      entityId: invitationId,
      metadata: { actorPlatformRole },
    });

    return { success: true };
  }

  /**
   * Public token validation for staff onboarding portal
   */
  static async validateStaffInvitationToken(rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      const err: any = new Error('Valid invitation token is required.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo: true,
            currency: true,
            currencySymbol: true,
            defaultLanguage: true,
          },
        },
      },
    });

    if (!invitation) {
      const err: any = new Error('Invitation not found or invalid token.');
      err.statusCode = 404;
      err.errorCode = 'INVITATION_NOT_FOUND';
      throw err;
    }

    if (invitation.revokedAt) {
      const err: any = new Error('This invitation has been revoked. Please ask your restaurant manager for a new link.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_REVOKED';
      throw err;
    }

    if (invitation.acceptedAt) {
      const err: any = new Error('This invitation has already been accepted. Please log in with your credentials.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_ALREADY_ACCEPTED';
      throw err;
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      const err: any = new Error('This invitation has expired. Please ask your restaurant manager for a new link.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_EXPIRED';
      throw err;
    }

    return {
      valid: true,
      invitedEmail: invitation.invitedEmail,
      invitedName: invitation.invitedName,
      role: invitation.role,
      jobTemplate: invitation.jobTemplate,
      restaurant: invitation.restaurant,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Accepts invitation, sets employee password, links/creates UserRestaurant, and issues JWT session
   */
  static async acceptStaffInvitation(
    rawToken: string,
    data: { password: string; name?: string },
    ipAddress?: string
  ) {
    if (!data.password || data.password.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_PASSWORD';
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await prisma.staffInvitation.findUnique({
      where: { tokenHash },
      include: { restaurant: true },
    });

    if (!invitation) {
      const err: any = new Error('Invitation not found or invalid token.');
      err.statusCode = 404;
      err.errorCode = 'INVITATION_NOT_FOUND';
      throw err;
    }

    if (invitation.revokedAt) {
      const err: any = new Error('This invitation has been revoked.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_REVOKED';
      throw err;
    }

    if (invitation.acceptedAt) {
      const err: any = new Error('This invitation has already been accepted.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_ALREADY_ACCEPTED';
      throw err;
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      const err: any = new Error('This invitation has expired.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_EXPIRED';
      throw err;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const normalizedEmail = invitation.invitedEmail.toLowerCase().trim();

    const user = await prisma.$transaction(async (tx) => {
      // Find or create User
      let u = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!u) {
        u = await tx.user.create({
          data: {
            email: normalizedEmail,
            name: data.name ? data.name.trim() : invitation.invitedName,
            passwordHash,
            active: true,
          },
        });
      } else {
        u = await tx.user.update({
          where: { id: u.id },
          data: {
            passwordHash,
            name: data.name ? data.name.trim() : u.name,
            active: true,
          },
        });
      }

      // Upsert UserRestaurant membership
      let membership = await tx.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: u.id,
            restaurantId: invitation.restaurantId,
          },
        },
      });

      if (!membership) {
        membership = await tx.userRestaurant.create({
          data: {
            userId: u.id,
            restaurantId: invitation.restaurantId,
            role: invitation.role,
            jobTemplate: invitation.jobTemplate,
            status: StaffStatus.ACTIVE,
          },
        });
      } else {
        membership = await tx.userRestaurant.update({
          where: { id: membership.id },
          data: {
            role: invitation.role,
            jobTemplate: invitation.jobTemplate,
            status: StaffStatus.ACTIVE,
          },
        });
      }

      // Apply staged permissions
      if (invitation.stagedPermissions && invitation.stagedPermissions.length > 0) {
        const dbPermissions = await tx.permission.findMany({
          where: { key: { in: invitation.stagedPermissions } },
        });

        if (dbPermissions.length > 0) {
          // Clear any existing
          await tx.userRestaurantPermission.deleteMany({
            where: { userRestaurantId: membership.id },
          });

          await tx.userRestaurantPermission.createMany({
            data: dbPermissions.map((p) => ({
              userRestaurantId: membership.id,
              permissionId: p.id,
            })),
            skipDuplicates: true,
          });
        }
      }

      // Mark invitation accepted
      await tx.staffInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      // Audit acceptance
      await tx.auditLog.create({
        data: {
          restaurantId: invitation.restaurantId,
          userId: u.id,
          action: AuditAction.STAFF_INVITATION_ACCEPT,
          entityType: 'StaffInvitation',
          entityId: invitation.id,
          ipAddress: ipAddress || null,
          metadata: {
            email: u.email,
            role: invitation.role,
            jobTemplate: invitation.jobTemplate,
          },
        },
      });

      return u;
    });

    // Issue JWT session
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.name,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    return {
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      restaurant: {
        id: invitation.restaurant.id,
        name: invitation.restaurant.name,
        slug: invitation.restaurant.slug,
      },
    };
  }
}
