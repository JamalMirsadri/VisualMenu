import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, MediaType, Prisma, Role } from '@prisma/client';
import { prisma } from '../prisma';
import { AuditService } from '../services/auditService';
import { validateCategoryOwnership, validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, requirePermission, authenticateToken } from '../middleware/authMiddleware';
import { getStorageProvider } from '../services/storageProvider';
import { hasPermission } from '../constants/permissions';

export const foodRouter = Router();

// GET /api/restaurants/:restaurantId/foods
foodRouter.get(
  '/restaurants/:restaurantId/foods',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_MENU'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { categoryId, availableOnly, includeDeleted } = req.query;

      const foods = await prisma.foodItem.findMany({
        where: {
          restaurantId,
          ...(includeDeleted === 'true' ? {} : { deletedAt: null }),
          ...(categoryId ? { categoryId: String(categoryId) } : {}),
          ...(availableOnly === 'true' ? { available: true } : {}),
        },
        orderBy: { displayOrder: 'asc' },
        include: {
          media: true,
          category: {
            select: { id: true, name: true, slug: true },
          },
        },
      });

      const formatted = foods.map((f) => {
        const primaryImage = f.media.find((m) => m.type === 'IMAGE' && m.isPrimary) ||
          f.media.find((m) => m.type === 'IMAGE');
        const primaryVideo = f.media.find((m) => m.type === 'VIDEO');

        return {
          id: f.id,
          restaurantId: f.restaurantId,
          categoryId: f.categoryId,
          categoryName: f.category.name,
          name: f.name,
          slug: f.slug,
          tagline: f.tagline || undefined,
          description: f.description || '',
          price: Number(f.price),
          currency: f.currency,
          currencySymbol: '€',
          available: f.available,
          featured: f.featured,
          spicyLevel: f.spicyLevel,
          preparationTime: f.preparationTime || undefined,
          displayOrder: f.displayOrder,
          order: f.displayOrder,
          calories: f.calories || undefined,
          ingredients: f.ingredients,
          allergens: f.allergens,
          image: primaryImage?.url || '',
          video: primaryVideo?.url || undefined,
          media: f.media,
          deletedAt: f.deletedAt,
        };
      });

      res.json({ success: true, data: formatted });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/foods/:id
foodRouter.get(
  '/foods/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('VIEW_MENU'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const f = await prisma.foodItem.findUnique({
        where: { id },
        include: { media: true, category: true },
      });

      if (!f) {
        res.status(404).json({
          success: false,
          message: `Food item with ID '${id}' not found.`,
          errorCode: 'FOOD_NOT_FOUND',
        });
        return;
      }

      const primaryImage = f.media.find((m) => m.type === 'IMAGE' && m.isPrimary) ||
        f.media.find((m) => m.type === 'IMAGE');
      const primaryVideo = f.media.find((m) => m.type === 'VIDEO');

      res.json({
        success: true,
        data: {
          id: f.id,
          restaurantId: f.restaurantId,
          categoryId: f.categoryId,
          categoryName: f.category.name,
          name: f.name,
          slug: f.slug,
          tagline: f.tagline || undefined,
          description: f.description || '',
          price: Number(f.price),
          currency: f.currency,
          available: f.available,
          featured: f.featured,
          spicyLevel: f.spicyLevel,
          preparationTime: f.preparationTime || undefined,
          displayOrder: f.displayOrder,
          order: f.displayOrder,
          calories: f.calories || undefined,
          ingredients: f.ingredients,
          allergens: f.allergens,
          image: primaryImage?.url || '',
          video: primaryVideo?.url || undefined,
          media: f.media,
          deletedAt: f.deletedAt,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/foods
foodRouter.post(
  '/restaurants/:restaurantId/foods',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('MANAGE_FOODS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const {
        categoryId,
        name,
        slug,
        tagline,
        description,
        price,
        currency,
        available,
        featured,
        spicyLevel,
        preparationTime,
        displayOrder,
        order,
        calories,
        ingredients,
        allergens,
        image,
        video,
      } = req.body;

      if (!categoryId || !name || price === undefined) {
        res.status(400).json({
          success: false,
          message: 'categoryId, name, and price are required fields.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      // Check MANAGE_FOOD_PRICES permission if user is not OWNER
      if (price !== undefined && req.userRole !== Role.OWNER && !req.isPlatformOverride) {
        let userPerms = req.userPermissions;
        if (!userPerms) {
          const m = await prisma.userRestaurant.findUnique({
            where: { userId_restaurantId: { userId: req.user!.id, restaurantId } },
            include: { permissions: { include: { permission: true } } },
          });
          userPerms = (m?.permissions.length || m?.jobTemplate) ? m.permissions.map((p) => p.permission.key) : undefined;
        }
        if (!hasPermission(req.userRole || Role.STAFF, 'MANAGE_FOOD_PRICES', userPerms)) {
          res.status(403).json({
            success: false,
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            message: 'You lack permission to set food prices (MANAGE_FOOD_PRICES required).',
          });
          return;
        }
      }

      if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
        res.status(400).json({
          success: false,
          message: 'Price must be a valid positive number.',
          errorCode: 'INVALID_PRICE',
        });
        return;
      }

      if (!categoryId) {
        res.status(400).json({
          success: false,
          message: 'categoryId is required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      // Multi-tenant check: Category must belong to this restaurant
      const isOwner = await validateCategoryOwnership(categoryId, restaurantId);
      if (!isOwner) {
        res.status(400).json({
          success: false,
          message: 'Cross-tenant violation: The selected category does not belong to this restaurant.',
          errorCode: 'CATEGORY_RESTAURANT_MISMATCH',
        });
        return;
      }

      const generatedSlug = (slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '') + `-${Date.now().toString(36).slice(-4)}`;

      const finalOrder = displayOrder !== undefined ? displayOrder : (order !== undefined ? order : 0);

      // Create Food + Media inside a Prisma Transaction
      const result = await prisma.$transaction(async (tx) => {
        const food = await tx.foodItem.create({
          data: {
            restaurantId,
            categoryId,
            name: name.trim(),
            slug: generatedSlug,
            tagline: tagline?.trim() || null,
            description: description?.trim() || '',
            price: new Prisma.Decimal(Number(price).toFixed(2)),
            currency: currency || 'EUR',
            available: available !== undefined ? Boolean(available) : true,
            featured: Boolean(featured),
            spicyLevel: Number(spicyLevel) || 0,
            preparationTime: preparationTime ? Number(preparationTime) : null,
            displayOrder: Number(finalOrder) || 0,
            calories: calories ? Number(calories) : null,
            ingredients: Array.isArray(ingredients) ? ingredients : [],
            allergens: Array.isArray(allergens) ? allergens : [],
          },
        });

        const trimmedImage = typeof image === 'string' ? image.trim() : '';
        const trimmedVideo = typeof video === 'string' ? video.trim() : '';

        if (trimmedImage) {
          await tx.media.create({
            data: {
              restaurantId,
              foodItemId: food.id,
              type: MediaType.IMAGE,
              url: trimmedImage,
              isPrimary: true,
              sourceType: trimmedImage.startsWith('/uploads/') ? 'UPLOAD' : 'EXTERNAL_URL',
            },
          });
        }

        if (trimmedVideo) {
          await tx.media.create({
            data: {
              restaurantId,
              foodItemId: food.id,
              type: MediaType.VIDEO,
              url: trimmedVideo,
              isPrimary: false,
              sourceType: trimmedVideo.startsWith('/uploads/') ? 'UPLOAD' : 'EXTERNAL_URL',
            },
          });
        }

        return food;
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'FoodItem',
        entityId: result.id,
        metadata: { name: result.name, price: Number(result.price) },
      });

      res.status(201).json({
        success: true,
        data: {
          ...result,
          price: Number(result.price),
          image: image || '',
          video: video || undefined,
          order: result.displayOrder,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/foods/:id
foodRouter.put(
  '/foods/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_FOODS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const {
        categoryId,
        name,
        slug,
        tagline,
        description,
        price,
        currency,
        available,
        featured,
        spicyLevel,
        preparationTime,
        displayOrder,
        order,
        calories,
        ingredients,
        allergens,
        image,
        video,
      } = req.body;

      const existing = await prisma.foodItem.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({
          success: false,
          message: `Food item with ID '${id}' not found.`,
          errorCode: 'FOOD_NOT_FOUND',
        });
        return;
      }

      // Check MANAGE_FOOD_PRICES permission if price is being changed
      if (price !== undefined && Number(price) !== Number(existing.price) && req.userRole !== Role.OWNER && !req.isPlatformOverride) {
        let userPerms = req.userPermissions;
        if (!userPerms) {
          const m = await prisma.userRestaurant.findUnique({
            where: { userId_restaurantId: { userId: req.user!.id, restaurantId: existing.restaurantId } },
            include: { permissions: { include: { permission: true } } },
          });
          userPerms = (m?.permissions.length || m?.jobTemplate) ? m.permissions.map((p) => p.permission.key) : undefined;
        }
        if (!hasPermission(req.userRole || Role.STAFF, 'MANAGE_FOOD_PRICES', userPerms)) {
          res.status(403).json({
            success: false,
            errorCode: 'INSUFFICIENT_PERMISSIONS',
            message: 'You lack permission to change food prices (MANAGE_FOOD_PRICES required).',
          });
          return;
        }
      }

      // Check category ownership if categoryId is changing
      if (categoryId && categoryId !== existing.categoryId) {
        const isOwner = await validateCategoryOwnership(categoryId, existing.restaurantId);
        if (!isOwner) {
          res.status(400).json({
            success: false,
            message: 'Cross-tenant violation: The target category does not belong to the same restaurant.',
            errorCode: 'CATEGORY_RESTAURANT_MISMATCH',
          });
          return;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        const food = await tx.foodItem.update({
          where: { id },
          data: {
            categoryId: categoryId || undefined,
            name: name !== undefined ? name.trim() : undefined,
            slug: slug || undefined,
            tagline: tagline !== undefined ? (tagline ? tagline.trim() : null) : undefined,
            description: description !== undefined ? description.trim() : undefined,
            price: price !== undefined ? new Prisma.Decimal(Number(price).toFixed(2)) : undefined,
            currency: currency || undefined,
            available: available !== undefined ? Boolean(available) : undefined,
            featured: featured !== undefined ? Boolean(featured) : undefined,
            spicyLevel: spicyLevel !== undefined ? Number(spicyLevel) : undefined,
            preparationTime: preparationTime !== undefined ? (preparationTime ? Number(preparationTime) : null) : undefined,
            displayOrder: displayOrder !== undefined ? Number(displayOrder) : (order !== undefined ? Number(order) : undefined),
            calories: calories !== undefined ? (calories ? Number(calories) : null) : undefined,
            ingredients: Array.isArray(ingredients) ? ingredients : undefined,
            allergens: Array.isArray(allergens) ? allergens : undefined,
          },
        });

        if (image !== undefined) {
          const imgRecord = await tx.media.findFirst({
            where: { foodItemId: id, type: MediaType.IMAGE },
          });
          const trimmedImg = typeof image === 'string' ? image.trim() : '';

          if (trimmedImg) {
            const isUpload = trimmedImg.startsWith('/uploads/');
            if (imgRecord) {
              if (imgRecord.url && imgRecord.url.startsWith('/uploads/') && imgRecord.url !== trimmedImg) {
                const oldKey = imgRecord.url.replace('/uploads/', '');
                await getStorageProvider().delete(oldKey).catch(() => {});
              }
              await tx.media.update({
                where: { id: imgRecord.id },
                data: {
                  url: trimmedImg,
                  sourceType: isUpload ? 'UPLOAD' : 'EXTERNAL_URL',
                },
              });
            } else {
              await tx.media.create({
                data: {
                  restaurantId: existing.restaurantId,
                  foodItemId: id,
                  type: MediaType.IMAGE,
                  url: trimmedImg,
                  isPrimary: true,
                  sourceType: isUpload ? 'UPLOAD' : 'EXTERNAL_URL',
                },
              });
            }
          } else if (imgRecord) {
            if (imgRecord.url && imgRecord.url.startsWith('/uploads/')) {
              const oldKey = imgRecord.url.replace('/uploads/', '');
              await getStorageProvider().delete(oldKey).catch(() => {});
            }
            await tx.media.delete({ where: { id: imgRecord.id } });
          }
        }

        if (video !== undefined) {
          const vidRecord = await tx.media.findFirst({
            where: { foodItemId: id, type: MediaType.VIDEO },
          });
          const trimmedVid = typeof video === 'string' ? video.trim() : '';

          if (trimmedVid) {
            const isUpload = trimmedVid.startsWith('/uploads/');
            if (vidRecord) {
              if (vidRecord.url && vidRecord.url.startsWith('/uploads/') && vidRecord.url !== trimmedVid) {
                const oldKey = vidRecord.url.replace('/uploads/', '');
                await getStorageProvider().delete(oldKey).catch(() => {});
              }
              await tx.media.update({
                where: { id: vidRecord.id },
                data: {
                  url: trimmedVid,
                  sourceType: isUpload ? 'UPLOAD' : 'EXTERNAL_URL',
                },
              });
            } else {
              await tx.media.create({
                data: {
                  restaurantId: existing.restaurantId,
                  foodItemId: id,
                  type: MediaType.VIDEO,
                  url: trimmedVid,
                  isPrimary: false,
                  sourceType: isUpload ? 'UPLOAD' : 'EXTERNAL_URL',
                },
              });
            }
          } else if (vidRecord) {
            if (vidRecord.url && vidRecord.url.startsWith('/uploads/')) {
              const oldKey = vidRecord.url.replace('/uploads/', '');
              await getStorageProvider().delete(oldKey).catch(() => {});
            }
            await tx.media.delete({ where: { id: vidRecord.id } });
          }
        }

        return food;
      });

      await AuditService.log({
        restaurantId: existing.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'FoodItem',
        entityId: id,
        metadata: { updatedFields: Object.keys(req.body) },
      });

      const currentMedia = await prisma.media.findMany({
        where: { foodItemId: id },
      });
      const currentImage =
        currentMedia.find((m) => m.type === MediaType.IMAGE && m.isPrimary) ||
        currentMedia.find((m) => m.type === MediaType.IMAGE);
      const currentVideo = currentMedia.find((m) => m.type === MediaType.VIDEO);

      res.json({
        success: true,
        data: {
          ...updated,
          price: Number(updated.price),
          image: currentImage?.url || '',
          video: currentVideo?.url || undefined,
          order: updated.displayOrder,
          media: currentMedia,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/foods/:id/availability (Instant live toggle)
foodRouter.patch(
  '/foods/:id/availability',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('TOGGLE_FOOD_AVAILABILITY'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { available } = req.body;

      if (available === undefined) {
        res.status(400).json({
          success: false,
          message: 'available boolean is required in request body.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const updated = await prisma.foodItem.update({
        where: { id },
        data: { available: Boolean(available) },
      });

      await AuditService.log({
        restaurantId: updated.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'FoodItem',
        entityId: id,
        metadata: { available: updated.available },
      });

      res.json({
        success: true,
        data: { id: updated.id, available: updated.available },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/foods/:id/price (Instant live price update)
foodRouter.patch(
  '/foods/:id/price',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { price } = req.body;

      if (price === undefined || isNaN(Number(price)) || Number(price) < 0) {
        res.status(400).json({
          success: false,
          message: 'Valid positive price number is required.',
          errorCode: 'INVALID_PRICE',
        });
        return;
      }

      const updated = await prisma.foodItem.update({
        where: { id },
        data: { price: new Prisma.Decimal(Number(price).toFixed(2)) },
      });

      await AuditService.log({
        restaurantId: updated.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'FoodItem',
        entityId: id,
        metadata: { price: Number(updated.price) },
      });

      res.json({
        success: true,
        data: { id: updated.id, price: Number(updated.price) },
      });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/foods/:id (Soft Deletion)
foodRouter.delete(
  '/foods/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_FOODS'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const updated = await prisma.foodItem.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await AuditService.log({
        restaurantId: updated.restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'FoodItem',
        entityId: id,
        metadata: { softDeleted: true },
      });

      res.json({ success: true, message: 'Food item soft-deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/foods/:id/duplicate (Transaction)
foodRouter.post(
  '/foods/:id/duplicate',
  validateUuidParams(['id']),
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      const source = await prisma.foodItem.findUnique({
        where: { id },
        include: { media: true },
      });

      if (!source) {
        res.status(404).json({
          success: false,
          message: `Food item with ID '${id}' not found.`,
          errorCode: 'FOOD_NOT_FOUND',
        });
        return;
      }

      const copySlug = `${source.slug}-copy-${Date.now().toString(36).slice(-4)}`;

      const duplicated = await prisma.$transaction(async (tx) => {
        const copy = await tx.foodItem.create({
          data: {
            restaurantId: source.restaurantId,
            categoryId: source.categoryId,
            name: `${source.name} (Copy)`,
            slug: copySlug,
            tagline: source.tagline,
            description: source.description,
            price: source.price,
            currency: source.currency,
            available: source.available,
            featured: false,
            spicyLevel: source.spicyLevel,
            preparationTime: source.preparationTime,
            displayOrder: source.displayOrder + 1,
            calories: source.calories,
            ingredients: source.ingredients,
            allergens: source.allergens,
          },
        });

        // Copy media
        for (const m of source.media) {
          await tx.media.create({
            data: {
              restaurantId: source.restaurantId,
              foodItemId: copy.id,
              type: m.type,
              url: m.url,
              thumbnailUrl: m.thumbnailUrl,
              isPrimary: m.isPrimary,
            },
          });
        }

        return copy;
      });

      await AuditService.log({
        restaurantId: source.restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'FoodItem',
        entityId: duplicated.id,
        metadata: { duplicatedFrom: id },
      });

      res.status(201).json({
        success: true,
        data: {
          ...duplicated,
          price: Number(duplicated.price),
          order: duplicated.displayOrder,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/foods/reorder (Batch transaction)
foodRouter.patch(
  '/foods/reorder',
  requireRestaurantAccess([Role.OWNER, Role.ADMIN, Role.MANAGER]),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId, foodIds } = req.body;
      if (!restaurantId || !Array.isArray(foodIds)) {
        res.status(400).json({
          success: false,
          message: 'restaurantId and foodIds array are required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      await prisma.$transaction(
        foodIds.map((id: string, index: number) =>
          prisma.foodItem.updateMany({
            where: { id, restaurantId },
            data: { displayOrder: index + 1 },
          })
        )
      );

      res.json({ success: true, message: 'Foods reordered successfully.' });
    } catch (err) {
      next(err);
    }
  }
);
