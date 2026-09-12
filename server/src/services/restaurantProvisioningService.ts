import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuditAction, PlatformRole, ProvisioningStatus, Role, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from './auditService';

const JWT_SECRET = process.env.JWT_SECRET || 'aura_super_secure_jwt_secret_dev_2026_key';

export interface ProvisionRestaurantInput {
  name: string;
  slug: string;
  legalName?: string;
  address?: string;
  city?: string;
  country?: string;
  phone?: string;
  email?: string;
  currency?: string;
  currencySymbol?: string;
  ownerName: string;
  ownerEmail: string;
  theme?: string;
  presentationMode?: string;
  language?: string;
  taxRate?: number;
  serviceChargeRate?: number;
}

export class RestaurantProvisioningService {
  /**
   * Normalizes and validates a URL-safe restaurant slug
   */
  static normalizeSlug(rawSlug: string): string {
    const slug = rawSlug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const RESERVED_SLUGS = new Set([
      'admin',
      'platform',
      'owner',
      'api',
      'auth',
      'menu',
      'login',
      'health',
      'system',
      'public',
      'dashboard',
      'settings',
      'test',
      'staging',
    ]);

    if (!slug || slug.length < 2) {
      const err: any = new Error('Slug must be at least 2 characters long and contain alphanumeric characters.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_SLUG';
      throw err;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      const err: any = new Error('Slug contains invalid characters. Must be lowercase alphanumeric separated by hyphens.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_SLUG';
      throw err;
    }

    if (RESERVED_SLUGS.has(slug)) {
      const err: any = new Error(`The slug "${slug}" is a reserved system identifier and cannot be used.`);
      err.statusCode = 400;
      err.errorCode = 'RESERVED_SLUG';
      throw err;
    }

    return slug;
  }

  /**
   * Transactional provisioning of a completely isolated, empty restaurant tenant
   */
  static async provisionRestaurant(
    input: ProvisionRestaurantInput,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    if (!input.name || !input.name.trim()) {
      const err: any = new Error('Restaurant name is required.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_INPUT';
      throw err;
    }
    if (!input.ownerName || !input.ownerName.trim()) {
      const err: any = new Error('Owner full name is required.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_INPUT';
      throw err;
    }
    if (!input.ownerEmail || !input.ownerEmail.trim()) {
      const err: any = new Error('Owner email address is required.');
      err.statusCode = 400;
      err.errorCode = 'INVALID_INPUT';
      throw err;
    }

    const slug = this.normalizeSlug(input.slug || input.name);
    const normalizedEmail = input.ownerEmail.toLowerCase().trim();

    // Check slug uniqueness
    const existingRestaurant = await prisma.restaurant.findUnique({
      where: { slug },
    });
    if (existingRestaurant) {
      const err: any = new Error(`Restaurant with slug "${slug}" already exists.`);
      err.statusCode = 409;
      err.errorCode = 'SLUG_CONFLICT';
      throw err;
    }

    // Execute atomic provisioning transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Resolve or create Owner User
      let user = await tx.user.findUnique({
        where: { email: normalizedEmail },
      });

      if (!user) {
        // Create user with a secure random placeholder password until invitation accepted
        const placeholderPassword = crypto.randomBytes(32).toString('hex');
        const passwordHash = await bcrypt.hash(placeholderPassword, 10);

        user = await tx.user.create({
          data: {
            name: input.ownerName.trim(),
            email: normalizedEmail,
            passwordHash,
            active: true,
          },
        });
      }

      // 2. Create Restaurant in PROVISIONING state
      const currency = input.currency || 'EUR';
      const currencySymbol = input.currencySymbol || (currency === 'USD' ? '$' : '€');
      const addressParts = [input.address, input.city, input.country].filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : null;

      const restaurant = await tx.restaurant.create({
        data: {
          name: input.name.trim(),
          slug,
          email: input.email ? input.email.trim() : normalizedEmail,
          phone: input.phone ? input.phone.trim() : null,
          address: fullAddress,
          currency,
          currencySymbol,
          defaultLanguage: input.language || 'en',
          active: true,
          provisioningStatus: ProvisioningStatus.PROVISIONING,
          createdByPlatformUserId: actorUserId,
          provisionedAt: new Date(),
        },
      });

      // 3. Create UserRestaurant OWNER membership
      const existingMembership = await tx.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: user.id,
            restaurantId: restaurant.id,
          },
        },
      });

      if (!existingMembership) {
        await tx.userRestaurant.create({
          data: {
            userId: user.id,
            restaurantId: restaurant.id,
            role: Role.OWNER,
          },
        });
      }

      // 4. Create RestaurantSettings with safe neutral defaults
      await tx.restaurantSettings.create({
        data: {
          restaurantId: restaurant.id,
          theme: input.theme || 'DARK_LUXURY',
          presentationMode: input.presentationMode || 'INDIVIDUAL_VIDEO',
          language: input.language || 'en',
          taxEnabled: Boolean(input.taxRate && input.taxRate > 0),
          taxRate: input.taxRate || 0.0,
          serviceChargeEnabled: Boolean(input.serviceChargeRate && input.serviceChargeRate > 0),
          serviceChargeRate: input.serviceChargeRate || 0.0,
          cashPaymentEnabled: true,
          cardPaymentEnabled: true,
          mbwayPaymentEnabled: true,
          showPrices: true,
          showCalories: true,
          showPreparationTime: true,
          showAllergens: true,
          showIngredients: true,
        },
      });

      // 4b. Phase 13C: Strict No-Subscription Rule
      // Newly created restaurants MUST NEVER receive an ACTIVE subscription automatically.
      // No plan is automatically assigned. No payment is assumed.

      // 5. Generate secure random invitation token and store hash
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

      const invitation = await tx.ownerInvitation.create({
        data: {
          restaurantId: restaurant.id,
          invitedEmail: normalizedEmail,
          invitedName: input.ownerName.trim(),
          tokenHash,
          expiresAt,
          createdByUserId: actorUserId,
        },
      });

      // 6. Record Audit Trail
      await tx.auditLog.create({
        data: {
          restaurantId: restaurant.id,
          userId: actorUserId,
          action: AuditAction.RESTAURANT_CREATE,
          entityType: 'Restaurant',
          entityId: restaurant.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            actorPlatformRole,
            restaurantName: restaurant.name,
            slug: restaurant.slug,
            ownerEmail: normalizedEmail,
          },
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: restaurant.id,
          userId: actorUserId,
          action: AuditAction.OWNER_INVITATION_CREATE,
          entityType: 'OwnerInvitation',
          entityId: invitation.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            actorPlatformRole,
            invitedEmail: normalizedEmail,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      // 7. Transition Restaurant to SUBSCRIPTION_PENDING state (Phase 13C)
      const pendingRestaurant = await tx.restaurant.update({
        where: { id: restaurant.id },
        data: {
          provisioningStatus: ProvisioningStatus.SUBSCRIPTION_PENDING,
          activatedAt: null,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId: pendingRestaurant.id,
          userId: actorUserId,
          action: AuditAction.RESTAURANT_PROVISION_SUCCESS,
          entityType: 'Restaurant',
          entityId: pendingRestaurant.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            actorPlatformRole,
            status: 'SUBSCRIPTION_PENDING',
          },
        },
      });

      return {
        restaurant: pendingRestaurant,
        owner: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        invitation: {
          id: invitation.id,
          rawToken,
          expiresAt: invitation.expiresAt,
          onboardingUrl: `/owner/onboarding/${rawToken}`,
        },
      };
    });

    return result;
  }

  /**
   * Retrieves provisioning details, owner, invitation state, and tenant counts
   */
  static async getProvisioningStatus(restaurantId: string) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        settings: true,
        userRestaurants: {
          where: { role: Role.OWNER },
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
            customers: true,
            payments: true,
            fiscalDocuments: true,
          },
        },
      },
    });

    if (!restaurant) {
      return null;
    }

    const latestInvitation = restaurant.ownerInvitations[0] || null;
    let invitationStatus: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED' | 'NONE' = 'NONE';

    if (latestInvitation) {
      if (latestInvitation.acceptedAt) {
        invitationStatus = 'ACCEPTED';
      } else if (latestInvitation.revokedAt) {
        invitationStatus = 'REVOKED';
      } else if (new Date() > new Date(latestInvitation.expiresAt)) {
        invitationStatus = 'EXPIRED';
      } else {
        invitationStatus = 'PENDING';
      }
    }

    return {
      restaurant: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        active: restaurant.active,
        provisioningStatus: restaurant.provisioningStatus,
        provisionedAt: restaurant.provisionedAt,
        activatedAt: restaurant.activatedAt,
        createdAt: restaurant.createdAt,
      },
      owner: restaurant.userRestaurants[0]?.user || null,
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
      entityCounts: {
        categories: restaurant._count.categories,
        foods: restaurant._count.foods,
        media: restaurant._count.media,
        tables: restaurant._count.tables,
        orders: restaurant._count.orders,
        customers: restaurant._count.customers,
        payments: restaurant._count.payments,
        fiscalDocuments: restaurant._count.fiscalDocuments,
      },
    };
  }

  /**
   * Resends an owner invitation, revoking any previous active invitation
   */
  static async resendOwnerInvitation(
    restaurantId: string,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        userRestaurants: {
          where: { role: Role.OWNER },
          include: { user: true },
        },
      },
    });

    if (!restaurant) {
      const err: any = new Error('Restaurant not found.');
      err.statusCode = 404;
      throw err;
    }

    const owner = restaurant.userRestaurants[0]?.user;
    if (!owner) {
      const err: any = new Error('No registered owner found for this restaurant.');
      err.statusCode = 400;
      throw err;
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Revoke any pending invitations
      await tx.ownerInvitation.updateMany({
        where: {
          restaurantId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      // Create fresh invitation
      const invitation = await tx.ownerInvitation.create({
        data: {
          restaurantId,
          invitedEmail: owner.email,
          invitedName: owner.name,
          tokenHash,
          expiresAt,
          createdByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          restaurantId,
          userId: actorUserId,
          action: AuditAction.OWNER_INVITATION_RESEND,
          entityType: 'OwnerInvitation',
          entityId: invitation.id,
          actorPlatformRole: actorPlatformRole || null,
          ipAddress: ipAddress || null,
          metadata: {
            actorPlatformRole,
            invitedEmail: owner.email,
            expiresAt: expiresAt.toISOString(),
          },
        },
      });

      return invitation;
    });

    return {
      invitation: {
        id: result.id,
        rawToken,
        expiresAt: result.expiresAt,
        onboardingUrl: `/owner/onboarding/${rawToken}`,
      },
    };
  }

  /**
   * Revokes an active invitation
   */
  static async revokeOwnerInvitation(
    restaurantId: string,
    actorUserId: string,
    actorPlatformRole?: PlatformRole,
    ipAddress?: string
  ) {
    const updated = await prisma.ownerInvitation.updateMany({
      where: {
        restaurantId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      await AuditService.log({
        restaurantId,
        userId: actorUserId,
        action: AuditAction.OWNER_INVITATION_REVOKE,
        entityType: 'OwnerInvitation',
        entityId: restaurantId,
        metadata: {
          actorPlatformRole,
          revokedCount: updated.count,
        },
      });
    }

    return { success: true, revokedCount: updated.count };
  }

  /**
   * Validates an invitation token for public onboarding lookup
   */
  static async validateInvitationToken(rawToken: string) {
    if (!rawToken || typeof rawToken !== 'string') {
      const err: any = new Error('Valid invitation token is required.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await prisma.ownerInvitation.findUnique({
      where: { tokenHash },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
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
      const err: any = new Error('This invitation has been revoked. Please request a new invitation from Platform Admin.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_REVOKED';
      throw err;
    }

    if (invitation.acceptedAt) {
      const err: any = new Error('This invitation has already been accepted. You can log in with your credentials.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_ALREADY_ACCEPTED';
      throw err;
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      const err: any = new Error('This invitation has expired. Please request a new invitation from Platform Admin.');
      err.statusCode = 410;
      err.errorCode = 'INVITATION_EXPIRED';
      throw err;
    }

    return {
      valid: true,
      invitedEmail: invitation.invitedEmail,
      invitedName: invitation.invitedName,
      restaurant: invitation.restaurant,
      expiresAt: invitation.expiresAt,
    };
  }

  /**
   * Accepts an invitation, sets owner password, marks invitation accepted, and logs in
   */
  static async acceptOwnerInvitation(
    rawToken: string,
    data: { password: string; name?: string },
    ipAddress?: string
  ) {
    if (!data.password || data.password.length < 8) {
      const err: any = new Error('Password must be at least 8 characters long.');
      err.statusCode = 400;
      throw err;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const invitation = await prisma.ownerInvitation.findUnique({
      where: { tokenHash },
      include: {
        restaurant: true,
      },
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

    const newPasswordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.$transaction(async (tx) => {
      // Find user by invitedEmail
      let u = await tx.user.findUnique({
        where: { email: invitation.invitedEmail.toLowerCase().trim() },
      });

      if (!u) {
        // Create if missing
        u = await tx.user.create({
          data: {
            email: invitation.invitedEmail.toLowerCase().trim(),
            name: data.name ? data.name.trim() : invitation.invitedName,
            passwordHash: newPasswordHash,
            active: true,
          },
        });
      } else {
        // Update password and active status
        u = await tx.user.update({
          where: { id: u.id },
          data: {
            passwordHash: newPasswordHash,
            name: data.name ? data.name.trim() : u.name,
            active: true,
          },
        });
      }

      // Ensure UserRestaurant OWNER membership
      const membership = await tx.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: u.id,
            restaurantId: invitation.restaurantId,
          },
        },
      });

      if (!membership) {
        await tx.userRestaurant.create({
          data: {
            userId: u.id,
            restaurantId: invitation.restaurantId,
            role: Role.OWNER,
          },
        });
      }

      // Mark invitation as accepted
      await tx.ownerInvitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          restaurantId: invitation.restaurantId,
          userId: u.id,
          action: AuditAction.OWNER_INVITATION_ACCEPT,
          entityType: 'OwnerInvitation',
          entityId: invitation.id,
          ipAddress: ipAddress || null,
          metadata: {
            email: u.email,
            restaurantId: invitation.restaurantId,
            acceptedAt: new Date().toISOString(),
          },
        },
      });

      return u;
    });

    // Issue JWT token for the owner
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
