import { Router, Request, Response, NextFunction } from 'express';
import { RestaurantProvisioningService } from '../services/restaurantProvisioningService';

export const ownerInvitationRouter = Router();

/**
 * GET /api/owner/invitations/:token
 * Public lookup and validation of an owner onboarding invitation token
 */
ownerInvitationRouter.get(
  '/invitations/:token',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await RestaurantProvisioningService.validateInvitationToken(req.params.token);
      res.json({
        success: true,
        data,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'INVITATION_ERROR',
        message: err.message || 'Failed to validate invitation.',
      });
    }
  }
);

/**
 * POST /api/owner/invitations/:token/accept
 * Public onboarding completion: sets owner password, completes invitation, and returns JWT session
 */
ownerInvitationRouter.post(
  '/invitations/:token/accept',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { password, name } = req.body;
      if (!password) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'Password is required.',
        });
        return;
      }

      const session = await RestaurantProvisioningService.acceptOwnerInvitation(
        req.params.token,
        { password, name },
        req.ip
      );

      res.json({
        success: true,
        message: 'Owner onboarding completed successfully.',
        data: session,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'INVITATION_ACCEPT_ERROR',
        message: err.message || 'Failed to accept invitation.',
      });
    }
  }
);
