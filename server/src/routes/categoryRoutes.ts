import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, requirePermission, authenticateToken } from '../middleware/authMiddleware';

export const categoryRouter = Router();

// GET /api/restaurants/:restaurantId/categories
categoryRouter.get(
  '/restaurants/:restaurantId/categories',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_MENU'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const categories = await prisma.category.findMany({
        where: { restaurantId },
        orderBy: { displayOrder: 'asc' },
        include: {
          _count: {
            select: { foods: { where: { deletedAt: null } } },
          },
        },
      });

      const formatted = categories.map((c) => ({
        id: c.id,
        restaurantId: c.restaurantId,
        name: c.name,
        slug: c.slug,
        description: c.description || '',
        icon: c.icon || undefined,
        image: c.image || undefined,
        displayOrder: c.displayOrder,
        order: c.displayOrder,
        isActive: c.active,
        dishCount: c._count.foods,
      }));

      res.json({ success: true, data: formatted });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/categories
categoryRouter.post(
  '/restaurants/:restaurantId/categories',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('MANAGE_CATEGORIES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { name, slug, description, icon, image, displayOrder, order, isActive, active } = req.body;

      if (!name || !name.trim()) {
        res.status(400).json({
          success: false,
          message: 'Category name is required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      // Check restaurant exists
      const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId } });
      if (!rest) {
        res.status(404).json({
          success: false,
          message: `Restaurant with ID '${restaurantId}' not found.`,
          errorCode: 'RESTAURANT_NOT_FOUND',
        });
        return;
      }

      const generatedSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '');

      const finalOrder = displayOrder !== undefined ? displayOrder : (order !== undefined ? order : 0);
      const finalActive = isActive !== undefined ? isActive : (active !== undefined ? active : true);

      const category = await prisma.category.create({
        data: {
          restaurantId,
          name: name.trim(),
          slug: generatedSlug,
          description: description?.trim() || null,
          icon: icon || null,
          image: image || null,
          displayOrder: Number(finalOrder) || 0,
          active: Boolean(finalActive),
        },
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'Category',
        entityId: category.id,
        metadata: { name: category.name },
      });

      res.status(201).json({
        success: true,
        data: {
          ...category,
          order: category.displayOrder,
          isActive: category.active,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/categories/:id
categoryRouter.put(
  '/categories/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_CATEGORIES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { name, slug, description, icon, image, displayOrder, order, isActive, active } = req.body;

      const existing = await prisma.category.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({
          success: false,
          message: `Category with ID '${id}' not found.`,
          errorCode: 'CATEGORY_NOT_FOUND',
        });
        return;
      }

      const updated = await prisma.category.update({
        where: { id },
        data: {
          name: name !== undefined ? name.trim() : undefined,
          slug: slug !== undefined ? slug : undefined,
          description: description !== undefined ? description?.trim() : undefined,
          icon: icon !== undefined ? icon : undefined,
          image: image !== undefined ? image : undefined,
          displayOrder: displayOrder !== undefined ? Number(displayOrder) : (order !== undefined ? Number(order) : undefined),
          active: isActive !== undefined ? Boolean(isActive) : (active !== undefined ? Boolean(active) : undefined),
        },
      });

      await AuditService.log({
        restaurantId: updated.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Category',
        entityId: updated.id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      res.json({
        success: true,
        data: {
          ...updated,
          order: updated.displayOrder,
          isActive: updated.active,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/categories/:id (Safe Deletion)
categoryRouter.delete(
  '/categories/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_CATEGORIES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await prisma.category.findUnique({
        where: { id },
        include: {
          _count: { select: { foods: { where: { deletedAt: null } } } },
        },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: `Category with ID '${id}' not found.`,
          errorCode: 'CATEGORY_NOT_FOUND',
        });
        return;
      }

      // Safe deletion rule: Prevent accidental deletion of category with active foods
      if (existing._count.foods > 0) {
        res.status(400).json({
          success: false,
          message: `Cannot delete category '${existing.name}' because it contains ${existing._count.foods} active food items. Please reassign or delete the dishes first.`,
          errorCode: 'CATEGORY_HAS_ACTIVE_FOODS',
        });
        return;
      }

      await prisma.category.delete({ where: { id } });

      await AuditService.log({
        restaurantId: existing.restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'Category',
        entityId: id,
        metadata: { name: existing.name },
      });

      res.json({ success: true, message: 'Category deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/categories/reorder (Batch transaction reordering)
categoryRouter.patch(
  '/categories/reorder',
  authenticateToken,
  requirePermission('MANAGE_CATEGORIES'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, categoryIds } = req.body;
      if (!restaurantId || !Array.isArray(categoryIds)) {
        res.status(400).json({
          success: false,
          message: 'restaurantId and categoryIds array are required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      // Execute in Prisma transaction
      await prisma.$transaction(
        categoryIds.map((id: string, index: number) =>
          prisma.category.updateMany({
            where: { id, restaurantId },
            data: { displayOrder: index + 1 },
          })
        )
      );

      res.json({ success: true, message: 'Categories reordered successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
