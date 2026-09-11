import { Router, Request, Response, NextFunction } from 'express';
import { StaffService } from '../services/staffService';

export const staffInvitationRouter = Router();

/**
 * GET /api/staff/invitations/:token
 * Validates a staff invitation token and returns invitation & restaurant metadata.
 */
staffInvitationRouter.get(
  '/invitations/:token',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      const result = await StaffService.validateStaffInvitationToken(token);

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
 * POST /api/staff/invitations/:token/accept
 * Accepts a staff invitation, sets user password and name, and returns session token.
 */
staffInvitationRouter.post(
  '/invitations/:token/accept',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { token } = req.params;
      const { password, name } = req.body;

      const result = await StaffService.acceptStaffInvitation(
        token,
        { password, name },
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
