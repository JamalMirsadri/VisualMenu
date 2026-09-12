import { Router, Request, Response } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticateToken, requireRestaurantAccess } from '../middleware/authMiddleware';
import { SubscriptionService } from '../services/subscription/subscriptionService';
import { SubscriptionPaymentService } from '../services/subscription/subscriptionPaymentService';
import { getSubscriptionProvider } from '../services/subscription/providers';

export const subscriptionRouter = Router();

/**
 * Public/Authenticated: Get active subscription plans (authoritative pricing from DB)
 */
subscriptionRouter.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { price: 'asc' },
    });
    res.json({ success: true, data: plans });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Public: Payment Webhook endpoint (strictly verified and idempotent)
 */
subscriptionRouter.post('/webhooks/:provider', async (req: Request, res: Response) => {
  try {
    const provider = req.params.provider;
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const result = await SubscriptionPaymentService.processWebhook(provider, req.body, signature);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/**
 * Protected: Get current subscription status for a restaurant
 */
subscriptionRouter.get(
  '/restaurant/:restaurantId',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const status = await SubscriptionService.getSubscriptionStatus(restaurantId);

      if (!status) {
        res.json({
          success: true,
          data: null,
          subscriptionStatus: 'NONE',
        });
        return;
      }

      res.json({ success: true, data: status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Get subscription lifecycle events (audit history)
 */
subscriptionRouter.get(
  '/restaurant/:restaurantId/history',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId },
        select: { id: true },
      });

      if (!sub) {
        res.json({ success: true, data: [] });
        return;
      }

      const events = await prisma.subscriptionEvent.findMany({
        where: { subscriptionId: sub.id },
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      res.json({ success: true, data: events });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Get billing payments and invoices
 */
subscriptionRouter.get(
  '/restaurant/:restaurantId/payments',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId },
        select: { id: true },
      });

      if (!sub) {
        res.json({ success: true, data: { payments: [], invoices: [] } });
        return;
      }

      const [payments, invoices] = await Promise.all([
        prisma.subscriptionPayment.findMany({
          where: { subscriptionId: sub.id },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.subscriptionInvoice.findMany({
          where: { subscriptionId: sub.id },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

      res.json({ success: true, data: { payments, invoices } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Create checkout session
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/checkout',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const { planCode, provider: providerName } = req.body;

      const plan = await prisma.subscriptionPlan.findUnique({
        where: { code: planCode },
      });

      if (!plan || !plan.active) {
        res.status(400).json({ success: false, error: 'Invalid or inactive plan' });
        return;
      }

      let sub = await prisma.subscription.findFirst({
        where: { restaurantId },
      });

      if (!sub) {
        sub = await SubscriptionService.createSubscription({
          restaurantId,
          planId: plan.id,
          provider: providerName || 'MOCK',
          actorId: req.user?.id,
        });
      }

      const provider = getSubscriptionProvider(providerName || sub.provider);
      const session = await provider.createCheckoutSession({
        subscriptionId: sub.id,
        restaurantId,
        planCode: plan.code,
        amount: Number(plan.price),
        currency: plan.currency,
        customerEmail: req.user?.email,
      });

      res.json({ success: true, data: session });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Renew subscription
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/renew',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const idempotencyKey = (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

      const sub = await prisma.subscription.findFirst({
        where: { restaurantId },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'No subscription found to renew' });
        return;
      }

      const result = await SubscriptionPaymentService.processSubscriptionPayment({
        subscriptionId: sub.id,
        amount: req.body.amount,
        idempotencyKey,
        actorId: req.user?.id,
      });

      res.json({
        success: true,
        data: {
          subscription: result.subscription,
          payment: result.payment,
          isDuplicate: result.isDuplicate,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Cancel auto-renewal
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/cancel-auto-renew',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.cancelAutoRenew(sub.id, req.user?.id, req.body.reason);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Resume auto-renewal
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/resume',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const sub = await prisma.subscription.findFirst({
        where: { restaurantId },
      });

      if (!sub) {
        res.status(404).json({ success: false, error: 'Subscription not found' });
        return;
      }

      const updated = await SubscriptionService.resumeAutoRenew(sub.id, req.user?.id);
      res.json({ success: true, data: updated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Owner submits explicit subscription request
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/request',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const { planId, notes, billingInterval } = req.body;

      if (!planId) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'planId is required to submit a subscription request.',
        });
        return;
      }

      const request = await SubscriptionService.createSubscriptionRequest({
        restaurantId,
        requestedPlanId: planId,
        requestedByUserId: req.user!.id,
        notes,
        billingInterval,
      });

      res.status(201).json({
        success: true,
        message: 'Subscription request submitted successfully.',
        data: request,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'REQUEST_FAILED',
        message: err.message,
      });
    }
  }
);

/**
 * Protected: Get subscription requests for restaurant
 */
subscriptionRouter.get(
  '/restaurant/:restaurantId/requests',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const requests = await SubscriptionService.getSubscriptionRequests({ restaurantId });
      res.json({ success: true, data: requests });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * Protected: Activate subscription upon confirmed payment (Mock / Direct Provider)
 */
subscriptionRouter.post(
  '/restaurant/:restaurantId/activate',
  authenticateToken,
  requireRestaurantAccess([Role.OWNER, Role.ADMIN]),
  async (req: Request, res: Response) => {
    try {
      const restaurantId = req.params.restaurantId;
      const { planId, amount, currency = 'EUR', provider = 'MOCK', providerTransactionId, requestId } = req.body;

      if (!planId || amount === undefined) {
        res.status(400).json({
          success: false,
          errorCode: 'VALIDATION_ERROR',
          message: 'planId and amount are required.',
        });
        return;
      }

      const txId = providerTransactionId || `mock_tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      const subscription = await SubscriptionService.activateFromPayment({
        restaurantId,
        planId,
        amount: Number(amount),
        currency,
        provider,
        providerTransactionId: txId,
        requestId,
        actorUserId: req.user?.id,
      });

      res.json({
        success: true,
        message: 'Subscription activated successfully.',
        data: subscription,
      });
    } catch (err: any) {
      res.status(err.statusCode || 500).json({
        success: false,
        errorCode: err.errorCode || 'ACTIVATION_FAILED',
        message: err.message,
      });
    }
  }
);

