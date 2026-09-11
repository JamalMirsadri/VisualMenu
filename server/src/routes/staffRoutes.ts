import { Router, Request, Response, NextFunction } from 'express';
import { StaffStatus } from '@prisma/client';
import { StaffService } from '../services/staffService';
import { validateUuidParams } from '../middleware/validation';
import { requirePermission } from '../middleware/authMiddleware';
import { PERMISSION_CATALOG, ROLE_TEMPLATES } from '../constants/permissions';

export const staffRouter = Router();

/**
 * GET /api/restaurants/:restaurantId/staff-permissions-catalog
 * Returns full permissions catalog and role templates for the interactive permission matrix.
 */
staffRouter.get(
  '/restaurants/:restaurantId/staff-permissions-catalog',
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_STAFF'),
  async (_req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      data: {
        permissions: PERMISSION_CATALOG,
        templates: ROLE_TEMPLATES,
      },
    });
  }
);

/**
 * GET /api/restaurants/:restaurantId/staff
 * Lists all assigned staff members and pending staff invitations.
 */
staffRouter.get(
  '/restaurants/:restaurantId/staff',
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const result = await StaffService.listStaff(restaurantId);

      res.status(200).json({
        success: true,
        data: result.members,
        invitations: result.invitations,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/staff/:userId
 * Retrieves full details for a staff member.
 */
staffRouter.get(
  '/restaurants/:restaurantId/staff/:userId',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('VIEW_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const result = await StaffService.getStaffDetails(restaurantId, userId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/staff
 * Creates a staff member directly or issues a cryptographic invitation.
 */
staffRouter.post(
  '/restaurants/:restaurantId/staff',
  validateUuidParams(['restaurantId']),
  requirePermission('CREATE_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const result = await StaffService.createOrInviteStaff(
        restaurantId,
        req.body,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/restaurants/:restaurantId/staff/:userId/permissions
 * Atomically updates a staff member's permissions with audit log tracking.
 */
staffRouter.put(
  '/restaurants/:restaurantId/staff/:userId/permissions',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('MANAGE_STAFF_PERMISSIONS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const { permissions, jobTemplate } = req.body;

      if (!Array.isArray(permissions)) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_PERMISSIONS',
          message: 'Permissions must be provided as an array of permission keys.',
        });
        return;
      }

      const result = await StaffService.updateStaffPermissions(
        restaurantId,
        userId,
        permissions,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip,
        jobTemplate
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/restaurants/:restaurantId/staff/:userId/status
 * Enables or disables a staff member's access to this restaurant.
 */
staffRouter.patch(
  '/restaurants/:restaurantId/staff/:userId/status',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('DISABLE_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const { status } = req.body;

      if (!status || !Object.values(StaffStatus).includes(status)) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_STATUS',
          message: `Status must be one of: ${Object.values(StaffStatus).join(', ')}`,
        });
        return;
      }

      const result = await StaffService.updateStaffStatus(
        restaurantId,
        userId,
        status,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/restaurants/:restaurantId/staff/:userId
 * Removes a staff member from this restaurant. Global User account survives untouched.
 */
staffRouter.delete(
  '/restaurants/:restaurantId/staff/:userId',
  validateUuidParams(['restaurantId', 'userId']),
  requirePermission('DISABLE_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, userId } = req.params;
      const result = await StaffService.removeStaff(
        restaurantId,
        userId,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/staff/invitations/:invitationId/resend
 * Resends a staff invitation and revokes the previous token.
 */
staffRouter.post(
  '/restaurants/:restaurantId/staff/invitations/:invitationId/resend',
  validateUuidParams(['restaurantId', 'invitationId']),
  requirePermission('CREATE_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, invitationId } = req.params;
      const result = await StaffService.resendStaffInvitation(
        restaurantId,
        invitationId,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/restaurants/:restaurantId/staff/invitations/:invitationId
 * Revokes an active pending staff invitation.
 */
staffRouter.delete(
  '/restaurants/:restaurantId/staff/invitations/:invitationId',
  validateUuidParams(['restaurantId', 'invitationId']),
  requirePermission('CREATE_STAFF'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, invitationId } = req.params;
      await StaffService.revokeStaffInvitation(
        restaurantId,
        invitationId,
        req.user!.id,
        req.user!.platformRole || undefined,
        req.ip
      );

      res.status(200).json({
        success: true,
        message: 'Staff invitation revoked successfully.',
      });
    } catch (err) {
      next(err);
    }
  }
);
