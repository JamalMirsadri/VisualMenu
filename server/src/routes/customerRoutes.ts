import { Router, Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../prisma';
import { authenticateToken, requireRestaurantAccess, requirePermission } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { NifValidator } from '../services/fiscal/nifValidator';
import { hasPermission } from '../constants/permissions';

export const customerRouter = Router();

/**
 * GET /api/restaurants/:id/customers
 * Admin customer directory with order count, last order date, and consent status.
 * Masked fiscal data for privacy.
 */
customerRouter.get(
  '/restaurants/:id/customers',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('VIEW_CUSTOMERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const { search, page = '1', limit = '20' } = req.query;

      const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(String(limit), 10) || 20));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {
        OR: [
          { restaurantId },
          { orders: { some: { restaurantId } } },
        ],
      };

      if (search && typeof search === 'string') {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search, mode: 'insensitive' } },
            ],
          },
        ];
      }

      const [total, customers] = await Promise.all([
        prisma.customer.count({ where }),
        prisma.customer.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            fiscalProfiles: { select: { id: true, taxCountry: true } },
            orders: {
              where: { restaurantId },
              select: { id: true, total: true, createdAt: true },
              orderBy: { createdAt: 'desc' },
            },
          },
        }),
      ]);

      const formatted = customers.map((c) => {
        const orderCount = c.orders.length;
        const lastOrder = c.orders[0];
        const totalSpent = c.orders.reduce((acc, o) => acc + Number(o.total), 0);

        return {
          id: c.id,
          name: c.name || 'Guest Diner',
          email: c.email,
          phone: c.phone,
          preferredLanguage: c.preferredLanguage,
          marketingConsent: c.marketingConsent,
          consentGiven: c.marketingConsent,
          hasFiscalProfile: c.fiscalProfiles.length > 0,
          orderCount,
          totalSpent: Math.round(totalSpent * 100) / 100,
          lastOrderDate: lastOrder?.createdAt || null,
          createdAt: c.createdAt,
        };
      });

      res.status(200).json({
        success: true,
        data: {
          customers: formatted,
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
 * GET /api/restaurants/:id/customers/:customerId
 * Detailed customer profile with fiscal details and order history.
 * Restricted to VIEW_CUSTOMERS, with fiscalProfiles stripped/masked if lacking VIEW_CUSTOMER_FISCAL_DATA.
 */
customerRouter.get(
  '/restaurants/:id/customers/:customerId',
  validateUuidParams(['id', 'customerId']),
  authenticateToken,
  requirePermission('VIEW_CUSTOMERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId, customerId } = req.params;

      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          fiscalProfiles: true,
          orders: {
            where: { restaurantId },
            orderBy: { createdAt: 'desc' },
            include: {
              table: { select: { number: true, name: true } },
              payments: { select: { id: true, status: true, method: true, amount: true, createdAt: true } },
            },
          },
        },
      });

      if (!customer) {
        res.status(404).json({
          success: false,
          message: 'Customer not found.',
          errorCode: 'CUSTOMER_NOT_FOUND',
        });
        return;
      }

      // Check whether caller has permission to view sensitive fiscal / NIF data
      const userPerms = req.userPermissions;
      const canViewFiscal = hasPermission(req.userRole || Role.STAFF, 'VIEW_CUSTOMER_FISCAL_DATA', userPerms);

      let responseData: any = customer;
      if (!canViewFiscal) {
        responseData = {
          ...customer,
          taxId: null,
          taxCountry: null,
          fiscalProfiles: [],
        };
      }

      res.status(200).json({
        success: true,
        data: responseData,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:id/customers
 * Creates or updates customer profile with optional fiscal profile and consent.
 */
customerRouter.post(
  '/restaurants/:id/customers',
  validateUuidParams('id'),
  authenticateToken,
  requirePermission('MANAGE_CUSTOMERS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id: restaurantId } = req.params;
      const {
        name,
        email,
        phone,
        preferredLanguage = 'en',
        marketingConsent = false,
        taxId,
        taxCountry = 'PT',
        billingName,
        billingAddress,
      } = req.body;

      if (!name && !email && !phone) {
        res.status(400).json({
          success: false,
          message: 'At least one identifier (name, email, or phone) is required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      if (taxId) {
        const validation = NifValidator.validate(taxId, taxCountry);
        if (!validation.valid) {
          res.status(400).json({
            success: false,
            message: validation.error || 'Invalid tax identifier.',
            errorCode: 'INVALID_TAX_IDENTIFIER',
          });
          return;
        }
      }

      const customer = await prisma.customer.create({
        data: {
          restaurantId,
          name,
          email,
          phone,
          preferredLanguage,
          marketingConsent: Boolean(marketingConsent),
          marketingConsentAt: marketingConsent ? new Date() : null,
          fiscalProfiles: taxId
            ? {
                create: {
                  taxId: taxId.trim().toUpperCase(),
                  taxCountry: (taxCountry || 'PT').toUpperCase(),
                  billingName: billingName || name || null,
                  billingAddress: billingAddress || null,
                },
              }
            : undefined,
        },
        include: {
          fiscalProfiles: true,
        },
      });

      res.status(201).json({
        success: true,
        message: 'Customer profile created.',
        data: customer,
      });
    } catch (err) {
      next(err);
    }
  }
);
