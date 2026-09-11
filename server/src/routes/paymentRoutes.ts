import { Router, Request, Response, NextFunction } from 'express';
import { PaymentMethod, PaymentStatus, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { PaymentService } from '../services/payment/paymentService';
import { ReconciliationService } from '../services/payment/reconciliationService';
import { authenticateToken, requireRestaurantAccess, requirePermission } from '../middleware/authMiddleware';
import { paymentCreationRateLimiter } from '../middleware/rateLimiter';
import { validateUuidParams } from '../middleware/validation';
import { hasPermission } from '../constants/permissions';

export const paymentRouter = Router();

// =============================================================================
// PUBLIC / DINER PAYMENT INITIATION & DETAILS
// =============================================================================

/**
 * POST /api/payments
 * Initiates payment for an order.
 * Accepts Idempotency-Key header or body field to prevent duplicate charge attempts.
 */
paymentRouter.post(
  '/payments',
  paymentCreationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        orderId,
        restaurantId,
        method,
        phoneNumber,
        customerNote,
        metadata,
      } = req.body;

      const idempotencyKey =
        (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

      if (!orderId || !restaurantId || !method) {
        res.status(400).json({
          success: false,
          message: 'orderId, restaurantId, and method are required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      if (!Object.values(PaymentMethod).includes(method)) {
        res.status(400).json({
          success: false,
          message: `Invalid payment method: ${method}. Allowed: ${Object.values(PaymentMethod).join(', ')}`,
          errorCode: 'INVALID_PAYMENT_METHOD',
        });
        return;
      }

      const result = await PaymentService.initiatePayment({
        orderId,
        restaurantId,
        method,
        phoneNumber,
        idempotencyKey,
        metadata: {
          customerNote,
          ...metadata,
        },
      });

      res.status(result.isIdempotentReplay ? 200 : 201).json({
        success: true,
        message: result.isIdempotentReplay ? 'Payment request replayed.' : 'Payment initiated.',
        data: result.payment,
        clientSecret: result.clientSecret,
        approvalUrl: result.approvalUrl,
        providerPaymentId: result.providerPaymentId,
        isIdempotentReplay: result.isIdempotentReplay || false,
      });
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          message: err.message,
          errorCode: err.errorCode || 'PAYMENT_ERROR',
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/payments/:id
 * Retrieve details of a specific payment.
 */
paymentRouter.get(
  '/payments/:id',
  validateUuidParams('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({
        where: { id },
        include: {
          transactions: { orderBy: { createdAt: 'desc' } },
          fiscalDocuments: { select: { id: true, documentNumber: true, status: true, issuedAt: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              publicToken: true,
              total: true,
              currency: true,
              status: true,
            },
          },
        },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found.',
          errorCode: 'PAYMENT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: payment,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/payments/:id/cancel
 * Cancels a pending or unpaid payment.
 */
paymentRouter.post(
  '/payments/:id/cancel',
  validateUuidParams('id'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const payment = await prisma.payment.findUnique({
        where: { id },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found.',
          errorCode: 'PAYMENT_NOT_FOUND',
        });
        return;
      }

      if (payment.status === PaymentStatus.PAID) {
        res.status(400).json({
          success: false,
          message: 'Cannot cancel a paid payment. Use refund instead.',
          errorCode: 'PAYMENT_ALREADY_PAID',
        });
        return;
      }

      const updated = await prisma.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      res.status(200).json({
        success: true,
        message: 'Payment cancelled.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// WEBHOOK RECEIVER
// =============================================================================

/**
 * POST /api/payments/webhooks/:provider
 * Ingests external asynchronous payment webhooks (Stripe, MB WAY, Mock).
 * Protected against replay attacks and duplicates via PaymentWebhookEvent.
 */
paymentRouter.post(
  '/payments/webhooks/:provider',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { provider } = req.params;
      const result = await PaymentService.processWebhook(provider, req);

      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully.',
        data: result,
      });
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          message: err.message,
          errorCode: err.errorCode,
        });
        return;
      }
      next(err);
    }
  }
);

// =============================================================================
// ADMIN / STAFF PAYMENT OPERATIONS
// =============================================================================

/**
 * GET /api/restaurants/:id/payments
 * List payments for a restaurant with filtering, pagination, and tenant isolation.
 */
paymentRouter.get(
  '/restaurants/:id/payments',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_PAYMENTS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const {
        status,
        method,
        startDate,
        endDate,
        page = '1',
        limit = '20',
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        restaurantId,
        ...(status ? { status: String(status) as PaymentStatus } : {}),
        ...(method ? { method: String(method) as PaymentMethod } : {}),
      };

      if (startDate || endDate) {
        where.createdAt = {
          ...(startDate ? { gte: new Date(String(startDate)) } : {}),
          ...(endDate ? { lte: new Date(String(endDate)) } : {}),
        };
      }

      const [total, payments] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                total: true,
                table: { select: { number: true, name: true } },
              },
            },
            receivedByUser: { select: { id: true, name: true, email: true } },
            transactions: { select: { id: true, type: true, amount: true, status: true, createdAt: true } },
            fiscalDocuments: { select: { id: true, documentNumber: true, status: true, issuedAt: true } },
          },
        }),
      ]);

      res.status(200).json({
        success: true,
        data: payments,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/payments/:id/refund
 * Initiates full or partial refund. Requires OWNER, ADMIN, or MANAGER role.
 */
paymentRouter.post(
  '/payments/:id/refund',
  validateUuidParams('id'),
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: paymentId } = req.params;
      const { amount, reason } = req.body;

      // Check payment and verify caller role on payment's restaurant
      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });

      if (!payment) {
        res.status(404).json({
          success: false,
          message: 'Payment not found.',
          errorCode: 'PAYMENT_NOT_FOUND',
        });
        return;
      }

      // Verify caller has permissions for this restaurant
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user!.id,
            restaurantId: payment.restaurantId,
          },
        },
        include: {
          permissions: { include: { permission: true } },
        },
      });

      if (!membership) {
        res.status(403).json({
          success: false,
          message: 'You are not assigned to this restaurant tenant.',
          errorCode: 'RESTAURANT_ACCESS_DENIED',
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

      const assignedPermKeys = membership.permissions.map((p) => p.permission.key);
      const customPerms = (membership.permissions.length > 0 || membership.jobTemplate !== null)
        ? assignedPermKeys
        : undefined;

      if (!hasPermission(membership.role, 'PROCESS_PAYMENTS', customPerms)) {
        res.status(403).json({
          success: false,
          message: `Role ${membership.role} lacks 'PROCESS_PAYMENTS' permission.`,
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        });
        return;
      }

      const result = await PaymentService.refundPayment({
        paymentId,
        restaurantId: payment.restaurantId,
        amount: amount !== undefined ? Number(amount) : undefined,
        reason,
        userId: req.user!.id,
      });

      res.status(200).json({
        success: true,
        message: 'Refund processed successfully.',
        data: {
          ...result.payment,
          payment: result.payment,
          refundedAmount: result.refundedAmount,
          newStatus: result.newStatus,
          status: result.newStatus,
        },
      });
    } catch (err: any) {
      if (err.statusCode) {
        res.status(err.statusCode).json({
          success: false,
          message: err.message,
          errorCode: err.errorCode,
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:id/cash-operations
 * List cash payments with staff responsibility, amount received, and change given.
 */
paymentRouter.get(
  '/restaurants/:id/cash-operations',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_PAYMENTS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const { page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const where = {
        restaurantId,
        method: PaymentMethod.CASH,
      };

      const [total, cashPayments, allPaidCash] = await Promise.all([
        prisma.payment.count({ where }),
        prisma.payment.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            order: {
              select: {
                id: true,
                orderNumber: true,
                table: { select: { number: true, name: true } },
              },
            },
            receivedByUser: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.payment.findMany({
          where: {
            restaurantId,
            method: PaymentMethod.CASH,
            status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
          },
          select: {
            amount: true,
            amountReceived: true,
            changeGiven: true,
          },
        }),
      ]);

      const totalCashCollected = allPaidCash.reduce((acc, p) => acc + Number(p.amount), 0);
      const totalBanknotesReceived = allPaidCash.reduce(
        (acc, p) => acc + (Number(p.amountReceived) || Number(p.amount)),
        0
      );
      const totalCashGivenAsChange = allPaidCash.reduce((acc, p) => acc + (Number(p.changeGiven) || 0), 0);
      const netCashInRegister = Math.round((totalBanknotesReceived - totalCashGivenAsChange) * 100) / 100;

      const summary = {
        totalCashCollected: Math.round(totalCashCollected * 100) / 100,
        totalBanknotesReceived: Math.round(totalBanknotesReceived * 100) / 100,
        totalCashGivenAsChange: Math.round(totalCashGivenAsChange * 100) / 100,
        totalChangeGiven: Math.round(totalCashGivenAsChange * 100) / 100,
        netCashInRegister,
        transactionCount: allPaidCash.length,
        totalTransactions: allPaidCash.length,
      };

      res.status(200).json({
        success: true,
        data: {
          cashPayments,
          operations: cashPayments,
          summary,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        },
        cashPayments,
        summary,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:id/reconciliation
 * Generates financial reconciliation report comparing order totals and payments.
 */
paymentRouter.get(
  '/restaurants/:id/reconciliation',
  validateUuidParams('id'),
  authenticateToken,
  requireRestaurantAccess(Role.ADMIN),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const { startDate, endDate } = req.query;

      const sDate = startDate ? new Date(String(startDate)) : undefined;
      const eDate = endDate ? new Date(String(endDate)) : undefined;

      const report = await ReconciliationService.reconcileRestaurant(
        restaurantId,
        sDate,
        eDate
      );

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (err) {
      next(err);
    }
  }
);
