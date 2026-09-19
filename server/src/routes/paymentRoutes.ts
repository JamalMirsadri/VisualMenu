import { Router, Request, Response, NextFunction } from 'express';
import { PaymentMethod, PaymentStatus, PaymentTransactionType, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { PaymentService } from '../services/payment/paymentService';
import { ReconciliationService } from '../services/payment/reconciliationService';
import { authenticateToken, requireRestaurantAccess, requirePermission } from '../middleware/authMiddleware';
import { paymentCreationRateLimiter } from '../middleware/rateLimiter';
import { validateUuidParams } from '../middleware/validation';
import { hasPermission } from '../constants/permissions';
import { requireActiveSubscription, requireRestaurantServiceActive } from '../middleware/subscriptionMiddleware';
import { resolvePeriodBounds, buildCsv, buildXlsx, type ExportPeriod, type ExportFormat, type ExportRow } from '../services/exportService';

export const paymentRouter = Router();

async function sendExportFile(
  res: Response,
  format: ExportFormat,
  headers: string[],
  rows: ExportRow[],
  filenameBase: string
): Promise<void> {
  const ext = format === 'xlsx' ? 'xlsx' : 'csv';
  const filename = `${filenameBase}.${ext}`;

  if (format === 'xlsx') {
    const buffer = await buildXlsx(headers, rows, filenameBase);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    return;
  }

  const csv = buildCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

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
  requireRestaurantServiceActive(),
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
  authenticateToken,
  requirePermission('VIEW_PAYMENTS'),
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

paymentRouter.use('/restaurants/:id', authenticateToken, validateUuidParams('id'), requireActiveSubscription());

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
        limit = '10',
      } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));
      const skip = (pageNum - 1) * limitNum;

      const dateFilter = (startDate || endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(String(startDate)) } : {}),
              ...(endDate ? { lte: new Date(String(endDate)) } : {}),
            },
          }
        : {};

      const where: any = {
        restaurantId,
        ...(status ? { status: String(status) as PaymentStatus } : {}),
        ...(method ? { method: String(method) as PaymentMethod } : {}),
        ...dateFilter,
      };

      const revenueWhere: any = {
        restaurantId,
        ...dateFilter,
        status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
      };
      const outstandingWhere: any = {
        restaurantId,
        ...dateFilter,
        status: { in: [PaymentStatus.UNPAID, PaymentStatus.PENDING, PaymentStatus.AUTHORIZED] },
      };

      const [total, payments, grossAgg, outstandingAgg, refundAgg, paidCount] = await Promise.all([
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
            cancelledByUser: { select: { id: true, name: true, email: true } },
            transactions: { select: { id: true, type: true, amount: true, status: true, createdAt: true } },
            fiscalDocuments: { select: { id: true, documentNumber: true, status: true, issuedAt: true } },
          },
        }),
        prisma.payment.aggregate({ where: revenueWhere, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: outstandingWhere, _sum: { amount: true } }),
        prisma.paymentTransaction.aggregate({
          where: {
            payment: { restaurantId },
            type: { in: [PaymentTransactionType.REFUND, PaymentTransactionType.PARTIAL_REFUND] },
            status: 'SUCCESS',
            ...dateFilter,
          },
          _sum: { amount: true },
        }),
        prisma.payment.count({ where: revenueWhere }),
      ]);

      const grossAmount = Number(grossAgg._sum.amount ?? 0);
      const refundedAmount = Number(refundAgg._sum.amount ?? 0);
      const outstandingAmount = Number(outstandingAgg._sum.amount ?? 0);

      res.status(200).json({
        success: true,
        data: {
          payments,
          summary: {
            totalAmount: Math.round(grossAmount * 100) / 100,
            totalRefunded: Math.round(refundedAmount * 100) / 100,
            netAmount: Math.round((grossAmount - refundedAmount) * 100) / 100,
            paidCount,
            outstandingAmount: Math.round(outstandingAmount * 100) / 100,
          },
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
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
      const { page = '1', limit = '10', startDate, endDate } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 10));
      const skip = (pageNum - 1) * limitNum;

      const dateFilter = (startDate || endDate)
        ? {
            createdAt: {
              ...(startDate ? { gte: new Date(String(startDate)) } : {}),
              ...(endDate ? { lte: new Date(String(endDate)) } : {}),
            },
          }
        : {};

      const where = {
        restaurantId,
        method: PaymentMethod.CASH,
        ...dateFilter,
      };

      const settledWhere = {
        restaurantId,
        method: PaymentMethod.CASH,
        status: { in: [PaymentStatus.PAID, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED] },
        ...dateFilter,
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
            cancelledByUser: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.payment.findMany({
          where: settledWhere,
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
 * GET /api/restaurants/:id/payments/export
 * Tenant-scoped CSV / XLSX export of payment records for a Day / Month / Year period.
 */
paymentRouter.get(
  '/restaurants/:id/payments/export',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_PAYMENTS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const period = String(req.query.period || 'day') as ExportPeriod;
      const dateValue = req.query.date ? String(req.query.date) : undefined;
      const format = String(req.query.format || 'csv') as ExportFormat;

      if (!['day', 'month', 'year'].includes(period)) {
        res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_PERIOD', message: 'Period must be one of: day, month, year.' });
        return;
      }
      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_FORMAT', message: 'Format must be one of: csv, xlsx.' });
        return;
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, timezone: true },
      });
      if (!restaurant) {
        res.status(404).json({ success: false, errorCode: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
        return;
      }

      const bounds = resolvePeriodBounds(period, dateValue, restaurant.timezone || 'UTC');

      const payments = await prisma.payment.findMany({
        where: {
          restaurantId,
          createdAt: { gte: bounds.start, lt: bounds.end },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNumber: true } },
          receivedByUser: { select: { name: true } },
        },
      });

      const headers = [
        'Payment ID',
        'Order #',
        'Method',
        'Provider',
        'Status',
        'Amount',
        'Currency',
        'Amount Received',
        'Change Given',
        'Provider Payment ID',
        'Staff',
        'Completed At',
        'Created At',
      ];

      const rows: ExportRow[] = payments.map((p) => ({
        'Payment ID': p.id,
        'Order #': p.order?.orderNumber ?? '',
        Method: p.method,
        Provider: p.provider,
        Status: p.status,
        Amount: Number(p.amount),
        Currency: p.currency,
        'Amount Received': p.amountReceived != null ? Number(p.amountReceived) : '',
        'Change Given': p.changeGiven != null ? Number(p.changeGiven) : '',
        'Provider Payment ID': p.providerPaymentId ?? '',
        Staff: p.receivedByUser?.name ?? '',
        'Completed At': p.completedAt ? p.completedAt.toISOString() : '',
        'Created At': p.createdAt.toISOString(),
      }));

      await sendExportFile(res, format, headers, rows, `payments_${bounds.filenameDate}`);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:id/cash-operations/export
 * Tenant-scoped CSV / XLSX export of cash register records for a Day / Month / Year period.
 */
paymentRouter.get(
  '/restaurants/:id/cash-operations/export',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_PAYMENTS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const period = String(req.query.period || 'day') as ExportPeriod;
      const dateValue = req.query.date ? String(req.query.date) : undefined;
      const format = String(req.query.format || 'csv') as ExportFormat;

      if (!['day', 'month', 'year'].includes(period)) {
        res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_PERIOD', message: 'Period must be one of: day, month, year.' });
        return;
      }
      if (!['csv', 'xlsx'].includes(format)) {
        res.status(400).json({ success: false, errorCode: 'INVALID_EXPORT_FORMAT', message: 'Format must be one of: csv, xlsx.' });
        return;
      }

      const restaurant = await prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, timezone: true },
      });
      if (!restaurant) {
        res.status(404).json({ success: false, errorCode: 'RESTAURANT_NOT_FOUND', message: 'Restaurant not found.' });
        return;
      }

      const bounds = resolvePeriodBounds(period, dateValue, restaurant.timezone || 'UTC');

      const payments = await prisma.payment.findMany({
        where: {
          restaurantId,
          method: PaymentMethod.CASH,
          createdAt: { gte: bounds.start, lt: bounds.end },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          order: { select: { orderNumber: true } },
          receivedByUser: { select: { name: true } },
        },
      });

      const headers = [
        'Time',
        'Order #',
        'Total Due',
        'Amount Tendered',
        'Change Given',
        'Net Cash',
        'Settled By',
        'Status',
        'Completed At',
      ];

      const rows: ExportRow[] = payments.map((p) => ({
        Time: p.createdAt.toISOString(),
        'Order #': p.order?.orderNumber ?? '',
        'Total Due': Number(p.amount),
        'Amount Tendered': Number(p.amountReceived ?? p.amount),
        'Change Given': Number(p.changeGiven ?? 0),
        'Net Cash': Number(p.amount),
        'Settled By': p.receivedByUser?.name ?? '',
        Status: p.status,
        'Completed At': p.completedAt ? p.completedAt.toISOString() : '',
      }));

      await sendExportFile(res, format, headers, rows, `cash-register_${bounds.filenameDate}`);
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
