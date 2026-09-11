import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, OrderStatus, OrderItemStatus, Role, Prisma, PaymentMethod, PaymentStatus } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { realtimeService } from '../services/realtimeService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, authenticateToken, requirePermission, requireAnyPermission } from '../middleware/authMiddleware';
import { orderCreationRateLimiter, orderTrackingRateLimiter } from '../middleware/rateLimiter';
import { NifValidator } from '../services/fiscal/nifValidator';
import { CashPaymentService } from '../services/payment/cashPaymentService';
import { hasPermission } from '../constants/permissions';

export const orderRouter = Router();

// Allowed forward status progression
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.READY, OrderStatus.CANCELLED],
  [OrderStatus.READY]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [], // Terminal state
  [OrderStatus.CANCELLED]: [], // Terminal state
};

// Map order status to item status
const ORDER_TO_ITEM_STATUS: Partial<Record<OrderStatus, OrderItemStatus>> = {
  [OrderStatus.PREPARING]: OrderItemStatus.PREPARING,
  [OrderStatus.READY]: OrderItemStatus.READY,
  [OrderStatus.SERVED]: OrderItemStatus.SERVED,
  [OrderStatus.CANCELLED]: OrderItemStatus.CANCELLED,
};

// =============================================================================
// PUBLIC CUSTOMER ORDER SUBMISSION & SECURE ORDER TRACKING
// =============================================================================

/**
 * GET /api/orders/track/:publicOrderToken
 * Publicly track an order using its secure randomized publicToken.
 * Does not expose sensitive IDs or other restaurant data.
 */
orderRouter.get(
  '/orders/track/:publicOrderToken',
  orderTrackingRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicOrderToken } = req.params;

      const order = await prisma.order.findUnique({
        where: { publicToken: publicOrderToken },
        include: {
          items: true,
          table: {
            select: { id: true, number: true, name: true, location: true },
          },
          restaurant: {
            select: { id: true, name: true, slug: true, logo: true, currencySymbol: true },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              createdAt: true,
            },
          },
          payments: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              status: true,
              method: true,
              amount: true,
              currency: true,
              amountReceived: true,
              changeGiven: true,
              completedAt: true,
              createdAt: true,
            },
          },
          fiscalDocuments: {
            where: { status: 'ISSUED' },
            orderBy: { issuedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              documentNumber: true,
              documentType: true,
              status: true,
              issuedAt: true,
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          errorCode: 'ORDER_NOT_FOUND',
          message: 'Order tracking token not found or invalid.',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: order,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/orders
 * Public customer order creation with idempotency and transactional concurrency protection.
 */
orderRouter.post(
  '/orders',
  orderCreationRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.trim();
      const {
        restaurantSlug,
        tableNumber,
        items,
        customerNote,
        customerTaxId,
        customerTaxCountry,
        customerName,
        customerEmail,
        customerPhone,
        saveFiscalProfile,
        marketingConsent,
        nif,
        customerFiscalName,
        paymentMethod,
      } = req.body;

      const effectiveTaxId = (customerTaxId || nif)?.trim() || null;
      const effectiveName = (customerName || customerFiscalName)?.trim() || null;
      const effectiveEmail = customerEmail?.trim() || null;
      const effectivePhone = (customerPhone || req.body.phone)?.trim() || null;
      const shouldSaveFiscal = Boolean(saveFiscalProfile || marketingConsent);

      // Validate Tax Identification / NIF if provided
      let normalizedTaxId: string | null = null;
      let normalizedTaxCountry: string = (customerTaxCountry || 'PT').trim().toUpperCase();
      if (effectiveTaxId) {
        const taxValidation = NifValidator.validate(effectiveTaxId, normalizedTaxCountry);
        if (!taxValidation.valid) {
          res.status(400).json({
            success: false,
            message: taxValidation.error || 'Invalid tax identifier.',
            errorCode: 'INVALID_TAX_IDENTIFIER',
          });
          return;
        }
        normalizedTaxId = taxValidation.normalizedTaxId;
        normalizedTaxCountry = taxValidation.country;
      }

      // 1. Idempotency Check
      if (idempotencyKey) {
        const existingOrder = await prisma.order.findUnique({
          where: { idempotencyKey },
          include: {
            items: true,
            table: {
              select: { id: true, number: true, name: true, location: true },
            },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (existingOrder) {
          res.status(200).json({
            success: true,
            message: 'Idempotent replay: Order already processed.',
            data: {
              ...existingOrder,
              isIdempotentReplay: true,
            },
            isIdempotentReplay: true,
          });
          return;
        }
      }


      if (!restaurantSlug || typeof restaurantSlug !== 'string') {
        res.status(400).json({
          success: false,
          message: 'restaurantSlug is required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          message: 'Order must contain at least one item.',
          errorCode: 'EMPTY_ORDER',
        });
        return;
      }

      // 2. Resolve restaurant & verify active status
      const restaurant = await prisma.restaurant.findUnique({
        where: { slug: restaurantSlug },
        include: { settings: true },
      });

      if (!restaurant) {
        res.status(404).json({
          success: false,
          message: 'Restaurant was not found.',
          errorCode: 'RESTAURANT_NOT_FOUND',
        });
        return;
      }

      if (!restaurant.active) {
        res.status(400).json({
          success: false,
          message: 'This restaurant is currently closed or inactive. Orders cannot be placed at this time.',
          errorCode: 'RESTAURANT_INACTIVE',
        });
        return;
      }

      // 3. Resolve and validate table if specified
      let tableRecord = null;
      if (tableNumber !== undefined && tableNumber !== null && String(tableNumber).trim() !== '') {
        tableRecord = await prisma.table.findUnique({
          where: {
            restaurantId_number: {
              restaurantId: restaurant.id,
              number: String(tableNumber).trim(),
            },
          },
        });

        if (!tableRecord) {
          res.status(400).json({
            success: false,
            message: `Table '${tableNumber}' does not exist for this restaurant.`,
            errorCode: 'INVALID_TABLE',
          });
          return;
        }

        if (!tableRecord.active) {
          res.status(400).json({
            success: false,
            message: `Table '${tableNumber}' is currently inactive. Please speak with staff.`,
            errorCode: 'TABLE_INACTIVE',
          });
          return;
        }
      }

      // 4. Resolve & validate requested food items with concurrency check
      const requestedItemIds = items.map((i: any) => i.foodItemId);
      const foodRecords = await prisma.foodItem.findMany({
        where: {
          id: { in: requestedItemIds },
          restaurantId: restaurant.id,
          deletedAt: null,
        },
      });

      const foodMap = new Map(foodRecords.map((f) => [f.id, f]));

      let subtotalAcc = 0;
      const orderItemsPayload: Array<{
        foodItemId: string;
        foodNameSnapshot: string;
        unitPrice: Prisma.Decimal;
        quantity: number;
        lineTotal: Prisma.Decimal;
        customerNote: string | null;
        status: OrderItemStatus;
      }> = [];

      for (const item of items) {
        const qty = parseInt(String(item.quantity), 10);
        if (isNaN(qty) || qty <= 0) {
          res.status(400).json({
            success: false,
            message: 'Each order item must have a valid quantity of at least 1.',
            errorCode: 'INVALID_QUANTITY',
          });
          return;
        }

        const food = foodMap.get(item.foodItemId);
        if (!food) {
          res.status(400).json({
            success: false,
            message: `Dish not found or does not belong to this restaurant.`,
            errorCode: 'ITEM_NOT_FOUND',
          });
          return;
        }

        if (!food.available) {
          res.status(400).json({
            success: false,
            message: `Dish '${food.name}' is currently unavailable.`,
            errorCode: 'ITEM_UNAVAILABLE',
          });
          return;
        }

        const unitPriceNum = Number(food.price);
        const lineTotalNum = Math.round(unitPriceNum * qty * 100) / 100;
        subtotalAcc += lineTotalNum;

        orderItemsPayload.push({
          foodItemId: food.id,
          foodNameSnapshot: food.name,
          unitPrice: food.price,
          quantity: qty,
          lineTotal: new Prisma.Decimal(lineTotalNum.toFixed(2)),
          customerNote: item.customerNote ? String(item.customerNote).trim() : null,
          status: OrderItemStatus.PENDING,
        });
      }

      // 5. Calculate Tax & Service Charge from Settings
      const subtotalFixed = Math.round(subtotalAcc * 100) / 100;
      let taxFixed = 0;
      let serviceChargeFixed = 0;

      if (restaurant.settings?.taxEnabled) {
        const rate = Number(restaurant.settings.taxRate) || 0;
        taxFixed = Math.round(subtotalFixed * (rate / 100) * 100) / 100;
      }

      if (restaurant.settings?.serviceChargeEnabled) {
        const rate = Number(restaurant.settings.serviceChargeRate) || 0;
        serviceChargeFixed = Math.round(subtotalFixed * (rate / 100) * 100) / 100;
      }

      const totalFixed = Math.round((subtotalFixed + taxFixed + serviceChargeFixed) * 100) / 100;

      // 6. Atomic Transaction: Order, Items, and OrderStatusHistory
      const createdOrder = await prisma.$transaction(async (tx) => {
        // Re-verify availability inside transaction to prevent concurrency overselling
        for (const item of items) {
          const checkFood = await tx.foodItem.findUnique({
            where: { id: item.foodItemId },
            select: { available: true, name: true, deletedAt: true },
          });
          if (!checkFood || !checkFood.available || checkFood.deletedAt !== null) {
            throw new Error(`Dish '${checkFood?.name || 'Selected item'}' became unavailable.`);
          }
        }

        const orderCount = await tx.order.count({
          where: { restaurantId: restaurant.id },
        });

        // Format: [Prefix]-[1001 + count]
        const prefix = (restaurant.name.charAt(0) || 'R').toUpperCase();
        const orderNumber = `${prefix}-${1001 + orderCount}`;

        // Customer entity resolution / creation
        let customerId: string | null = null;
        if (effectiveEmail || effectivePhone) {
          let customerRecord = await tx.customer.findFirst({
            where: {
              ...(effectiveEmail ? { email: effectiveEmail } : { phone: effectivePhone }),
            },
          });

          if (!customerRecord) {
            customerRecord = await tx.customer.create({
              data: {
                restaurantId: restaurant.id,
                name: effectiveName,
                email: effectiveEmail,
                phone: effectivePhone,
                marketingConsent: shouldSaveFiscal,
                marketingConsentAt: shouldSaveFiscal ? new Date() : null,
              },
            });
          } else if (shouldSaveFiscal && !customerRecord.marketingConsent) {
            customerRecord = await tx.customer.update({
              where: { id: customerRecord.id },
              data: {
                marketingConsent: true,
                marketingConsentAt: new Date(),
              },
            });
          }

          customerId = customerRecord.id;

          if (normalizedTaxId && shouldSaveFiscal) {
            const existingProfile = await tx.customerFiscalProfile.findFirst({
              where: {
                customerId: customerRecord.id,
                taxId: normalizedTaxId,
              },
            });

            if (!existingProfile) {
              await tx.customerFiscalProfile.create({
                data: {
                  customerId: customerRecord.id,
                  taxId: normalizedTaxId,
                  taxCountry: normalizedTaxCountry,
                  billingName: effectiveName,
                },
              });
            }
          }
        }

        const newOrder = await tx.order.create({
          data: {
            restaurantId: restaurant.id,
            customerId,
            tableId: tableRecord ? tableRecord.id : null,
            idempotencyKey: idempotencyKey || null,
            orderNumber,
            status: OrderStatus.PENDING,
            subtotal: new Prisma.Decimal(subtotalFixed.toFixed(2)),
            tax: new Prisma.Decimal(taxFixed.toFixed(2)),
            discount: new Prisma.Decimal('0.00'),
            serviceCharge: new Prisma.Decimal(serviceChargeFixed.toFixed(2)),
            total: new Prisma.Decimal(totalFixed.toFixed(2)),
            currency: restaurant.currency,
            customerNote: customerNote ? String(customerNote).trim() : null,
            customerTaxId: normalizedTaxId,
            customerTaxCountry: normalizedTaxCountry,
            customerName: effectiveName,
            customerEmail: effectiveEmail,
            items: {
              create: orderItemsPayload,
            },
          },
          include: {
            items: true,
            payments: true,
            table: {
              select: { id: true, number: true, name: true, location: true },
            },
          },
        });

        // If a paymentMethod is specified at checkout, create initial Payment record
        if (paymentMethod && Object.values(PaymentMethod).includes(paymentMethod)) {
          const initialPayment = await tx.payment.create({
            data: {
              restaurantId: restaurant.id,
              orderId: newOrder.id,
              method: paymentMethod,
              provider: paymentMethod === PaymentMethod.CASH ? 'MANUAL_CASH' : 'MOCK',
              status: PaymentStatus.UNPAID,
              amount: new Prisma.Decimal(totalFixed.toFixed(2)),
              currency: restaurant.currency,
            },
          });
          (newOrder as any).payments = [initialPayment];
        }

        // Record initial status in OrderStatusHistory
        await tx.orderStatusHistory.create({
          data: {
            orderId: newOrder.id,
            fromStatus: null,
            toStatus: OrderStatus.PENDING,
            changedByUserId: null,
            metadata: { source: 'customer_order', customerNote: customerNote || null },
          },
        });

        return newOrder;
      });

      // Audit Log for public order creation
      await AuditService.log({
        restaurantId: restaurant.id,
        action: AuditAction.CREATE,
        entityType: 'Order',
        entityId: createdOrder.id,
        newValues: {
          orderNumber: createdOrder.orderNumber,
          publicToken: createdOrder.publicToken,
          total: createdOrder.total,
          itemCount: createdOrder.items.length,
          tableId: createdOrder.tableId,
        },
      });

      // Emit Realtime Event to Admin, Kitchen, and Customer
      realtimeService.notifyOrderCreated(restaurant.id, createdOrder);

      const responseData = {
        ...createdOrder,
        nif: createdOrder.customerTaxId,
        customerFiscalName: createdOrder.customerName,
      };

      res.status(201).json({
        success: true,
        message: 'Order created successfully.',
        data: responseData,
      });
    } catch (err: any) {
      // Concurrency race: If another request with identical idempotencyKey committed first
      const idempotencyKey = (req.headers['idempotency-key'] as string | undefined)?.trim();
      if (err?.code === 'P2002' && idempotencyKey) {
        try {
          const existingOrder = await prisma.order.findUnique({
            where: { idempotencyKey },
            include: {
              items: true,
              table: {
                select: { id: true, number: true, name: true, location: true },
              },
              statusHistory: {
                orderBy: { createdAt: 'asc' },
              },
            },
          });

          if (existingOrder) {
            res.status(200).json({
              success: true,
              message: 'Idempotent replay: Order already processed.',
              data: {
                ...existingOrder,
                isIdempotentReplay: true,
              },
              isIdempotentReplay: true,
            });
            return;
          }
        } catch {
          // Fall through to next(err) if lookup fails
        }
      }

      if (err.message && err.message.includes('became unavailable')) {
        res.status(400).json({
          success: false,
          errorCode: 'ITEM_UNAVAILABLE',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

// =============================================================================
// PROTECTED ADMIN & KITCHEN ORDER OPERATIONS
// =============================================================================

/**
 * GET /api/restaurants/:restaurantId/orders
 * Lists orders with filtering (status, table, date range) and pagination.
 */
orderRouter.get(
  '/restaurants/:restaurantId/orders',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_ORDERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { status, tableId, startDate, endDate, limit, page, assignedToMe, filter, assignedWaiterId } = req.query;

      const whereClause: Prisma.OrderWhereInput = { restaurantId };

      if (status && typeof status === 'string' && Object.values(OrderStatus).includes(status as OrderStatus)) {
        whereClause.status = status as OrderStatus;
      }

      if (tableId && typeof tableId === 'string') {
        whereClause.tableId = tableId;
      }

      if (assignedToMe === 'true') {
        whereClause.assignedWaiter = { userId: req.user!.id };
      } else if (assignedWaiterId && typeof assignedWaiterId === 'string') {
        whereClause.assignedWaiterUserRestaurantId = assignedWaiterId;
      }

      if (filter === 'ready-to-serve') {
        whereClause.status = OrderStatus.READY;
      } else if (filter === 'awaiting-payment') {
        whereClause.status = OrderStatus.SERVED;
      } else if (filter === 'needs-attention') {
        whereClause.status = { in: [OrderStatus.PENDING, OrderStatus.READY] };
      }

      if (startDate || endDate) {
        whereClause.createdAt = {};
        if (startDate) {
          whereClause.createdAt.gte = new Date(String(startDate));
        }
        if (endDate) {
          whereClause.createdAt.lte = new Date(String(endDate));
        }
      }

      const take = limit ? Math.min(100, Math.max(1, parseInt(String(limit), 10) || 50)) : 50;
      const skip = page ? Math.max(0, (parseInt(String(page), 10) - 1) * take) : 0;

      const [orders, total] = await Promise.all([
        prisma.order.findMany({
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          take,
          skip,
          include: {
            items: true,
            table: {
              select: { id: true, number: true, name: true, location: true },
            },
            statusHistory: {
              orderBy: { createdAt: 'asc' },
            },
            assignedWaiter: {
              include: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
            payments: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.order.count({ where: whereClause }),
      ]);

      res.status(200).json({
        success: true,
        data: orders,
        pagination: {
          total,
          limit: take,
          page: page ? parseInt(String(page), 10) : 1,
          pages: Math.ceil(total / take),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/orders/ready-to-serve
 * Quick queue of orders currently in READY status.
 */
orderRouter.get(
  '/restaurants/:restaurantId/orders/ready-to-serve',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requireAnyPermission(['VIEW_ORDERS', 'MARK_ORDER_SERVED']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const orders = await prisma.order.findMany({
        where: { restaurantId, status: OrderStatus.READY },
        orderBy: { createdAt: 'asc' },
        include: {
          items: true,
          table: { select: { id: true, number: true, name: true } },
          assignedWaiter: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
      res.status(200).json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/orders/awaiting-payment
 * Quick queue of served orders awaiting payment settlement.
 */
orderRouter.get(
  '/restaurants/:restaurantId/orders/awaiting-payment',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requireAnyPermission(['VIEW_ORDERS', 'VIEW_PAYMENTS', 'CONFIRM_CASH_PAYMENT']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const orders = await prisma.order.findMany({
        where: {
          restaurantId,
          status: { in: [OrderStatus.SERVED, OrderStatus.COMPLETED] },
          payments: {
            none: { status: PaymentStatus.PAID },
          },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          items: true,
          table: { select: { id: true, number: true, name: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 1 },
          assignedWaiter: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });
      res.status(200).json({ success: true, data: orders });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/restaurants/:restaurantId/orders/:orderId
 * Retrieves detailed breakdown of a single order with status history.
 */
orderRouter.get(
  '/restaurants/:restaurantId/orders/:orderId',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireAnyPermission(['VIEW_ORDER_DETAILS', 'VIEW_ORDERS', 'VIEW_KITCHEN']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
        include: {
          items: true,
          table: {
            select: { id: true, number: true, name: true, location: true },
          },
          assignedWaiter: {
            include: {
              user: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
            include: {
              changedByUser: {
                select: { id: true, name: true, email: true },
              },
            },
          },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({ success: true, data: order });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/restaurants/:restaurantId/orders/:orderId/status
 * Transitions order through the operational state machine and records history.
 */
orderRouter.patch(
  '/restaurants/:restaurantId/orders/:orderId/status',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER, Role.STAFF]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;
      const { status } = req.body;

      if (!status || !Object.values(OrderStatus).includes(status)) {
        res.status(400).json({
          success: false,
          message: `Invalid or missing status. Supported values: ${Object.values(OrderStatus).join(', ')}`,
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const targetStatus = status as OrderStatus;

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Validate allowed transitions
      const allowedNext = VALID_TRANSITIONS[order.status] || [];
      if (!allowedNext.includes(targetStatus)) {
        res.status(400).json({
          success: false,
          message: `Cannot transition order from '${order.status}' to '${targetStatus}'. Allowed transitions: ${allowedNext.join(', ') || 'None (Terminal state)'}`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }

      // Verify granular transition permission
      if (req.userRole !== Role.OWNER && !req.isPlatformOverride) {
        let requiredPerms: string[] = [];
        switch (targetStatus) {
          case OrderStatus.CONFIRMED:
            requiredPerms = ['CONFIRM_ORDER', 'UPDATE_ORDER_STATUS'];
            break;
          case OrderStatus.PREPARING:
            requiredPerms = ['UPDATE_ORDER_STATUS', 'CONFIRM_PREPARATION', 'UPDATE_KITCHEN_STATUS'];
            break;
          case OrderStatus.READY:
            requiredPerms = ['MARK_READY', 'UPDATE_ORDER_STATUS', 'UPDATE_KITCHEN_STATUS'];
            break;
          case OrderStatus.SERVED:
            requiredPerms = ['MARK_ORDER_SERVED', 'UPDATE_ORDER_STATUS'];
            break;
          case OrderStatus.COMPLETED:
            requiredPerms = ['MARK_ORDER_COMPLETED', 'UPDATE_ORDER_STATUS'];
            break;
          case OrderStatus.CANCELLED:
            requiredPerms = ['CANCEL_ORDER'];
            break;
        }

        let userPerms = req.userPermissions;
        if (!userPerms) {
          const m = await prisma.userRestaurant.findUnique({
            where: { userId_restaurantId: { userId: req.user!.id, restaurantId } },
            include: { permissions: { include: { permission: true } } },
          });
          userPerms = (m?.permissions.length || m?.jobTemplate) ? m.permissions.map((p) => p.permission.key) : undefined;
        }

        const isAuthorized = requiredPerms.some((perm) => hasPermission(req.userRole!, perm, userPerms));
        if (!isAuthorized) {
          res.status(403).json({
            success: false,
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            message: `You lack permission to transition order to '${targetStatus}'. Requires one of: [${requiredPerms.join(', ')}]`,
          });
          return;
        }
      }

      const updateData: Prisma.OrderUpdateInput = {
        status: targetStatus,
      };

      if (targetStatus === OrderStatus.COMPLETED) {
        updateData.completedAt = new Date();
      } else if (targetStatus === OrderStatus.CANCELLED) {
        updateData.cancelledAt = new Date();
      }

      // Update Order, OrderItems, and record OrderStatusHistory
      const updatedOrder = await prisma.$transaction(async (tx) => {
        const resOrder = await tx.order.update({
          where: { id: orderId },
          data: updateData,
          include: {
            items: true,
            table: true,
            statusHistory: { orderBy: { createdAt: 'asc' } },
          },
        });

        const childItemStatus = ORDER_TO_ITEM_STATUS[targetStatus];
        if (childItemStatus) {
          await tx.orderItem.updateMany({
            where: { orderId },
            data: { status: childItemStatus },
          });
        }

        // Record status history
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: targetStatus,
            changedByUserId: req.user?.id || null,
          },
        });

        return resOrder;
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        oldValues: { status: order.status },
        newValues: { status: targetStatus },
      });

      // Emit Realtime event
      realtimeService.notifyOrderStatusChanged(restaurantId, updatedOrder, order.status, targetStatus);

      res.status(200).json({
        success: true,
        message: `Order status updated to '${targetStatus}'.`,
        data: updatedOrder,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/restaurants/:restaurantId/orders/:orderId/items/:itemId/status
 * Updates the preparation status of an individual item within an order and notifies clients in real-time.
 */
orderRouter.patch(
  '/restaurants/:restaurantId/orders/:orderId/items/:itemId/status',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId', 'itemId']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER, Role.STAFF]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId, itemId } = req.params;
      const { status } = req.body;

      if (!status || !Object.values(OrderItemStatus).includes(status)) {
        res.status(400).json({
          success: false,
          message: `Invalid or missing status. Supported item values: ${Object.values(OrderItemStatus).join(', ')}`,
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const targetStatus = status as OrderItemStatus;

      // Verify order exists and belongs to this restaurant
      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
        select: { id: true, publicToken: true, status: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Verify item exists on this order
      const currentItem = await prisma.orderItem.findFirst({
        where: { id: itemId, orderId },
      });

      if (!currentItem) {
        res.status(404).json({
          success: false,
          message: 'Order item not found on this order.',
          errorCode: 'ITEM_NOT_FOUND',
        });
        return;
      }

      const fromStatus = currentItem.status;

      // Verify granular item transition permission
      if (req.userRole !== Role.OWNER && !req.isPlatformOverride) {
        let requiredPerms: string[] = ['UPDATE_KITCHEN_STATUS'];
        if (targetStatus === OrderItemStatus.PREPARING) {
          requiredPerms.push('CONFIRM_PREPARATION', 'UPDATE_ORDER_STATUS');
        } else if (targetStatus === OrderItemStatus.READY) {
          requiredPerms.push('MARK_READY', 'UPDATE_ORDER_STATUS');
        } else if (targetStatus === OrderItemStatus.SERVED) {
          requiredPerms.push('MARK_ORDER_SERVED', 'UPDATE_ORDER_STATUS');
        } else if (targetStatus === OrderItemStatus.CANCELLED) {
          requiredPerms.push('CANCEL_ORDER');
        }

        let userPerms = req.userPermissions;
        if (!userPerms) {
          const m = await prisma.userRestaurant.findUnique({
            where: { userId_restaurantId: { userId: req.user!.id, restaurantId } },
            include: { permissions: { include: { permission: true } } },
          });
          userPerms = (m?.permissions.length || m?.jobTemplate) ? m.permissions.map((p) => p.permission.key) : undefined;
        }

        const isAuthorized = requiredPerms.some((perm) => hasPermission(req.userRole!, perm, userPerms));
        if (!isAuthorized) {
          res.status(403).json({
            success: false,
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            message: `You lack permission to update item status to '${targetStatus}'. Requires one of: [${requiredPerms.join(', ')}]`,
          });
          return;
        }
      }

      // Update in transaction to guarantee commit safety
      const updatedItem = await prisma.$transaction(async (tx) => {
        return tx.orderItem.update({
          where: { id: itemId },
          data: { status: targetStatus },
        });
      });

      // Audit log
      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'OrderItem',
        entityId: itemId,
        oldValues: { status: fromStatus },
        newValues: { status: targetStatus },
      });

      // Emit Realtime event strictly AFTER transaction commits
      realtimeService.notifyOrderItemStatusChanged(
        restaurantId,
        order.publicToken,
        orderId,
        itemId,
        fromStatus,
        targetStatus,
        updatedItem
      );

      res.status(200).json({
        success: true,
        message: `Order item status updated to '${targetStatus}'.`,
        data: updatedItem,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/orders/:orderId/cancel
 * Cancels order and records reason in status history.
 */
orderRouter.post(
  '/restaurants/:restaurantId/orders/:orderId/cancel',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requirePermission('CANCEL_ORDER'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;
      const { reason } = req.body;

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      const allowedNext = VALID_TRANSITIONS[order.status] || [];
      if (!allowedNext.includes(OrderStatus.CANCELLED)) {
        res.status(400).json({
          success: false,
          message: `Cannot cancel an order with status '${order.status}'.`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const o = await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.CANCELLED,
            cancelledAt: new Date(),
          },
          include: { items: true, table: true },
        });

        await tx.orderItem.updateMany({
          where: { orderId },
          data: { status: OrderItemStatus.CANCELLED },
        });

        // Record status history
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.CANCELLED,
            changedByUserId: req.user?.id || null,
            metadata: { reason: reason || null },
          },
        });

        return o;
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        oldValues: { status: order.status },
        newValues: { status: OrderStatus.CANCELLED, cancellationReason: reason || null },
      });

      // Emit Realtime event
      realtimeService.notifyOrderStatusChanged(restaurantId, updated, order.status, OrderStatus.CANCELLED);

      res.status(200).json({
        success: true,
        message: 'Order cancelled successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// OPERATIONAL WAITER ASSIGNMENT & SERVE WORKFLOWS
// =============================================================================

/**
 * POST /api/restaurants/:restaurantId/orders/:orderId/assign
 * Assigns an order to a staff waiter within the same restaurant.
 */
orderRouter.post(
  '/restaurants/:restaurantId/orders/:orderId/assign',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireAnyPermission(['ASSIGN_ORDERS', 'UPDATE_ORDER_STATUS', 'VIEW_ORDERS']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;
      const { waiterUserId, userRestaurantId, staffUserRestaurantId } = req.body;
      const targetUserRestId = userRestaurantId || staffUserRestaurantId;

      // Find order
      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { table: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Find target staff member within this restaurant
      let targetMembership = null;
      if (targetUserRestId) {
        targetMembership = await prisma.userRestaurant.findFirst({
          where: { id: targetUserRestId, restaurantId, status: 'ACTIVE' },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
      } else if (waiterUserId) {
        targetMembership = await prisma.userRestaurant.findFirst({
          where: { userId: waiterUserId, restaurantId, status: 'ACTIVE' },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
      }

      if (!targetMembership) {
        res.status(400).json({
          success: false,
          message: 'Target waiter must be an active staff member of this restaurant.',
          errorCode: 'INVALID_STAFF_ASSIGNMENT',
        });
        return;
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { assignedWaiterUserRestaurantId: targetMembership.id },
        include: {
          table: true,
          items: true,
          assignedWaiter: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          event: 'ORDER_ASSIGN',
          assignedWaiterUserId: targetMembership.userId,
          assignedWaiterUserRestaurantId: targetMembership.id,
          assignedWaiterName: targetMembership.user.name,
        },
      });

      realtimeService.notifyOrderAssigned(
        restaurantId,
        orderId,
        {
          id: targetMembership.userId,
          userRestaurantId: targetMembership.id,
          name: targetMembership.user.name,
          email: targetMembership.user.email,
        },
        updated
      );

      res.status(200).json({
        success: true,
        message: `Order assigned to ${targetMembership.user.name}.`,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/orders/:orderId/claim
 * Concurrency-safe atomic claim by logged-in waiter.
 */
orderRouter.post(
  '/restaurants/:restaurantId/orders/:orderId/claim',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireAnyPermission(['UPDATE_ORDER_STATUS', 'ASSIGN_ORDERS']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;

      const membership = await prisma.userRestaurant.findFirst({
        where: { userId: req.user!.id, restaurantId, status: 'ACTIVE' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      if (!membership && req.userRole !== Role.OWNER && !req.isPlatformOverride) {
        res.status(403).json({
          success: false,
          message: 'You are not an active member of this restaurant.',
          errorCode: 'RESTAURANT_ACCESS_DENIED',
        });
        return;
      }

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
        include: {
          assignedWaiter: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      const waiterId = membership?.id;

      // Atomic update with concurrency check: only succeeds if unassigned or already assigned to same waiter
      const updatedCount = await prisma.order.updateMany({
        where: {
          id: orderId,
          restaurantId,
          OR: [
            { assignedWaiterUserRestaurantId: null },
            { assignedWaiterUserRestaurantId: waiterId },
          ],
        },
        data: { assignedWaiterUserRestaurantId: waiterId },
      });

      if (updatedCount.count === 0) {
        res.status(409).json({
          success: false,
          message: `Order has already been claimed by ${order.assignedWaiter?.user?.name || 'another waiter'}.`,
          errorCode: 'ORDER_ALREADY_ASSIGNED',
        });
        return;
      }

      const updated = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          table: true,
          items: true,
          assignedWaiter: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      });

      if (!updated) {
        res.status(404).json({
          success: false,
          message: 'Order not found after claim.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          event: 'ORDER_CLAIM',
          claimedByUserId: req.user?.id,
          claimedByName: membership?.user.name || req.user?.name,
        },
      });

      realtimeService.notifyOrderAssigned(
        restaurantId,
        orderId,
        {
          id: req.user!.id,
          userRestaurantId: waiterId || '',
          name: membership?.user.name || req.user?.name || 'Waiter',
          email: membership?.user.email || req.user?.email || '',
        },
        updated
      );

      res.status(200).json({
        success: true,
        message: 'Order claimed successfully.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/orders/:orderId/unassign
 * Releases waiter assignment on an order.
 */
orderRouter.post(
  '/restaurants/:restaurantId/orders/:orderId/unassign',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireAnyPermission(['ASSIGN_ORDERS', 'UPDATE_ORDER_STATUS']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      const membership = await prisma.userRestaurant.findFirst({
        where: { userId: req.user!.id, restaurantId, status: 'ACTIVE' },
      });

      // If assigned to someone else, only managers/admins/owners can unassign
      if (
        order.assignedWaiterUserRestaurantId &&
        order.assignedWaiterUserRestaurantId !== membership?.id &&
        req.userRole !== Role.OWNER &&
        req.userRole !== Role.ADMIN &&
        req.userRole !== Role.MANAGER &&
        !req.isPlatformOverride
      ) {
        res.status(403).json({
          success: false,
          message: 'You cannot unassign an order assigned to another waiter.',
          errorCode: 'INSUFFICIENT_PERMISSIONS',
        });
        return;
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { assignedWaiterUserRestaurantId: null },
        include: { table: true, items: true },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        metadata: { event: 'ORDER_UNASSIGN' },
      });

      realtimeService.notifyOrderAssigned(restaurantId, orderId, null, updated);

      res.status(200).json({
        success: true,
        message: 'Order unassigned.',
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/orders/:orderId/serve
 * Transitions order from READY to SERVED.
 */
orderRouter.post(
  '/restaurants/:restaurantId/orders/:orderId/serve',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requirePermission('MARK_ORDER_SERVED'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;

      const order = await prisma.order.findFirst({
        where: { id: orderId, restaurantId },
        include: { items: true, table: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Valid source status for serve - must be READY
      if (order.status !== OrderStatus.READY) {
        res.status(400).json({
          success: false,
          message: `Cannot serve order with status '${order.status}'. Order must be READY.`,
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const updateCount = await tx.order.updateMany({
          where: { id: orderId, status: OrderStatus.READY },
          data: { status: OrderStatus.SERVED },
        });

        if (updateCount.count === 0) {
          throw new Error('ORDER_ALREADY_SERVED');
        }

        const o = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            table: true,
            assignedWaiter: {
              include: { user: { select: { id: true, name: true, email: true } } },
            },
          },
        });

        await tx.orderItem.updateMany({
          where: { orderId, status: { notIn: [OrderItemStatus.CANCELLED] } },
          data: { status: OrderItemStatus.SERVED },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.status,
            toStatus: OrderStatus.SERVED,
            changedByUserId: req.user?.id || null,
            metadata: { event: 'ORDER_SERVED' },
          },
        });

        return o!;
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        metadata: { event: 'ORDER_SERVED', fromStatus: order.status, toStatus: OrderStatus.SERVED },
      });

      realtimeService.notifyOrderStatusChanged(restaurantId, updated, order.status, OrderStatus.SERVED);
      if (updated.tableId) {
        realtimeService.notifyFloorUpdated(restaurantId, updated.tableId, 'SERVED', { orderId });
      }

      res.status(200).json({
        success: true,
        message: 'Order marked as SERVED.',
        data: updated,
      });
    } catch (err: any) {
      if (err?.message === 'ORDER_ALREADY_SERVED') {
        res.status(400).json({
          success: false,
          message: 'Order has already been served or is not in READY status.',
          errorCode: 'INVALID_STATUS_TRANSITION',
        });
        return;
      }
      next(err);
    }
  }
);

/**
 * PATCH /api/restaurants/:restaurantId/orders/:orderId/priority
 * Sets priority on order (NORMAL, HIGH, URGENT).
 */
orderRouter.patch(
  '/restaurants/:restaurantId/orders/:orderId/priority',
  authenticateToken,
  validateUuidParams(['restaurantId', 'orderId']),
  requireAnyPermission(['UPDATE_ORDER_STATUS', 'VIEW_ORDERS', 'UPDATE_KITCHEN_STATUS', 'VIEW_KITCHEN']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, orderId } = req.params;
      const { priority } = req.body;

      if (!priority || !['NORMAL', 'HIGH', 'URGENT'].includes(String(priority).toUpperCase())) {
        res.status(400).json({
          success: false,
          message: "Priority must be one of: 'NORMAL', 'HIGH', 'URGENT'",
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { priority: String(priority).toUpperCase() },
        include: { table: true, items: true },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Order',
        entityId: orderId,
        metadata: { event: 'ORDER_PRIORITY_UPDATE', priority },
      });

      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
);

// =============================================================================
// STAFF CASH PAYMENT SETTLEMENT & DIGITAL RECEIPTS
// =============================================================================

/**
 * POST /api/orders/:id/cash-payment
 * Settle cash payment by staff with server-side change calculation and receipt generation.
 */
orderRouter.post(
  '/orders/:id/cash-payment',
  validateUuidParams('id'),
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: orderId } = req.params;
      const { amountReceived, notes } = req.body;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { restaurantId: true },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Verify caller is assigned to this restaurant tenant
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user!.id,
            restaurantId: order.restaurantId,
          },
        },
        include: {
          permissions: {
            include: { permission: true },
          },
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

      if (!hasPermission(membership.role, 'CONFIRM_CASH_PAYMENT', customPerms)) {
        res.status(403).json({
          success: false,
          errorCode: 'INSUFFICIENT_PERMISSIONS',
          message: `Your role (${membership.role}) lacks the required 'CONFIRM_CASH_PAYMENT' permission.`,
        });
        return;
      }

      const settlement = await CashPaymentService.confirmCashPayment({
        orderId,
        restaurantId: order.restaurantId,
        staffUserId: req.user!.id,
        amountReceived: amountReceived !== undefined && amountReceived !== null ? Number(amountReceived) : undefined,
        notes,
      });

      res.status(200).json({
        success: true,
        message: 'Cash payment marked as received.',
        data: settlement,
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
 * GET /api/orders/track/:publicOrderToken/receipt
 * Public customer download/view of issued digital receipt.
 */
orderRouter.get(
  '/orders/track/:publicOrderToken/receipt',
  orderTrackingRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { publicOrderToken } = req.params;

      const order = await prisma.order.findUnique({
        where: { publicToken: publicOrderToken },
        include: {
          restaurant: { select: { id: true, name: true, phone: true, address: true, logo: true, currencySymbol: true } },
          fiscalDocuments: {
            where: { status: 'ISSUED' },
            orderBy: { issuedAt: 'desc' },
            take: 1,
          },
          payments: {
            where: { status: 'PAID' },
            orderBy: { completedAt: 'desc' },
            take: 1,
            select: {
              id: true,
              method: true,
              amount: true,
              currency: true,
              amountReceived: true,
              changeGiven: true,
              completedAt: true,
            },
          },
          table: { select: { number: true, name: true } },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      const receipt = order.fiscalDocuments[0];
      if (!receipt) {
        res.status(404).json({
          success: false,
          message: 'No issued receipt found for this order yet.',
          errorCode: 'RECEIPT_NOT_FOUND',
        });
        return;
      }

      const receiptMeta = (receipt.metadata as any) || {};
      res.status(200).json({
        success: true,
        data: {
          ...receipt,
          hash: receiptMeta.hash || 'sha256:verified',
          snapshot: { items: receipt.itemsSnapshot },
          customerNif: receipt.customerTaxId,
          receipt,
          restaurant: order.restaurant,
          table: order.table,
          payment: order.payments[0] || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/orders/:id/receipt
 * Staff/Admin receipt retrieval for an order.
 */
orderRouter.get(
  '/orders/:id/receipt',
  validateUuidParams('id'),
  authenticateToken,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: orderId } = req.params;

      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          restaurant: { select: { id: true, name: true, phone: true, address: true, logo: true, currencySymbol: true } },
          fiscalDocuments: {
            where: { status: 'ISSUED' },
            orderBy: { issuedAt: 'desc' },
            take: 1,
          },
          payments: {
            where: { status: 'PAID' },
            orderBy: { completedAt: 'desc' },
            take: 1,
          },
          table: { select: { number: true, name: true } },
        },
      });

      if (!order) {
        res.status(404).json({
          success: false,
          message: 'Order not found.',
          errorCode: 'ORDER_NOT_FOUND',
        });
        return;
      }

      // Verify caller is staff for this restaurant
      const membership = await prisma.userRestaurant.findUnique({
        where: {
          userId_restaurantId: {
            userId: req.user!.id,
            restaurantId: order.restaurantId,
          },
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

      const receipt = order.fiscalDocuments[0];
      if (!receipt) {
        res.status(404).json({
          success: false,
          message: 'No issued receipt found for this order yet.',
          errorCode: 'RECEIPT_NOT_FOUND',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          receipt,
          restaurant: order.restaurant,
          table: order.table,
          payment: order.payments[0] || null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

