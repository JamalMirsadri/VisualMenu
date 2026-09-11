import { Router, Request, Response, NextFunction } from 'express';
import { AuditAction, MediaType, Role } from '@prisma/client';
import multer from 'multer';
import { MediaService } from '../services/mediaService';
import { AuditService } from '../services/auditService';
import { validateUuidParams } from '../middleware/validation';
import { requireRestaurantAccess, requirePermission, authenticateToken } from '../middleware/authMiddleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

export const mediaRouter = Router();

// GET /api/restaurants/:restaurantId/media
mediaRouter.get(
  '/restaurants/:restaurantId/media',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const { type, page, limit } = req.query;

      const mediaType = type === 'IMAGE' ? MediaType.IMAGE : type === 'VIDEO' ? MediaType.VIDEO : undefined;

      if (page !== undefined || limit !== undefined) {
        const paginated = await MediaService.listByRestaurant(restaurantId, {
          type: mediaType,
          page: Number(page) || 1,
          limit: Number(limit) || 20,
        });
        const result = paginated as any;
        res.json({
          success: true,
          data: result.items,
          pagination: {
            total: result.total,
            page: result.page,
            limit: result.limit,
            totalPages: result.totalPages,
          },
        });
        return;
      }

      const media = await MediaService.listByRestaurant(restaurantId, mediaType);
      res.json({ success: true, data: media });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/restaurants/:restaurantId/media/upload
 * Supports both multipart/form-data (binary 'file' field) and JSON base64 uploads.
 * Validates binary signature / MIME / size and stores file via pluggable storage provider.
 */
mediaRouter.post(
  '/restaurants/:restaurantId/media/upload',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('UPLOAD_MEDIA'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      let buffer: Buffer;
      let filename: string;
      let mimeType: string;

      if (req.file) {
        // Direct multipart file upload (e.g. Google Flow MP4 or local photo)
        buffer = req.file.buffer;
        filename = req.file.originalname;
        mimeType = req.file.mimetype;
      } else {
        const { fileBase64, filename: baseFilename, mimeType: baseMimeType } = req.body;
        if (!fileBase64 || !baseFilename || !baseMimeType) {
          res.status(400).json({
            success: false,
            errorCode: 'VALIDATION_ERROR',
            message: 'File or fileBase64, filename, and mimeType are required for media upload.',
          });
          return;
        }
        const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        buffer = Buffer.from(base64Data, 'base64');
        filename = baseFilename;
        mimeType = baseMimeType;
      }

      const created = await MediaService.uploadAndCreateMedia(
        restaurantId,
        {
          buffer,
          originalname: filename,
          mimetype: mimeType,
        },
        {
          foodItemId: req.body.foodItemId,
          altText: req.body.altText,
          isPrimary: Boolean(req.body.isPrimary),
          posterUrl: req.body.posterUrl,
          width: req.body.width ? Number(req.body.width) : undefined,
          height: req.body.height ? Number(req.body.height) : undefined,
          duration: req.body.duration !== undefined ? String(req.body.duration) : undefined,
          desktopUrl: req.body.desktopUrl,
          mobileUrl: req.body.mobileUrl,
        }
      );

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'Media',
        entityId: created.id,
        metadata: { url: created.url, type: created.type, source: 'file_upload' },
      });

      res.status(201).json({ success: true, data: created });
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('file signature') ||
          err.message.includes('MIME') ||
          err.message.includes('Unsupported file extension') ||
          err.message.includes('exceeds maximum allowed'))
      ) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_MEDIA_FILE',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/media (Metadata registration)
mediaRouter.post(
  '/restaurants/:restaurantId/media',
  authenticateToken,
  validateUuidParams(['restaurantId']),
  requirePermission('UPLOAD_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { restaurantId } = req.params;
      const {
        foodItemId,
        type,
        url,
        thumbnailUrl,
        filename,
        mimeType,
        size,
        duration,
        altText,
        isPrimary,
        width,
        height,
        desktopUrl,
        mobileUrl,
        posterUrl,
      } = req.body;

      if (!url || !type) {
        res.status(400).json({
          success: false,
          message: 'URL and type (IMAGE or VIDEO) are required.',
          errorCode: 'VALIDATION_ERROR',
        });
        return;
      }

      const mediaType = String(type).toUpperCase() === 'VIDEO' ? MediaType.VIDEO : MediaType.IMAGE;

      const created = await MediaService.createMedia({
        restaurantId,
        foodItemId,
        type: mediaType,
        url,
        thumbnailUrl,
        filename,
        mimeType,
        size: size !== undefined ? Number(size) : undefined,
        duration: duration !== undefined ? String(duration) : undefined,
        altText,
        isPrimary,
        width: width !== undefined ? Number(width) : undefined,
        height: height !== undefined ? Number(height) : undefined,
        desktopUrl,
        mobileUrl,
        posterUrl,
      });

      await AuditService.log({
        restaurantId,
        userId: req.user?.id,
        action: AuditAction.CREATE,
        entityType: 'Media',
        entityId: created.id,
        metadata: { url: created.url, type: created.type },
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/media/:id/replace
mediaRouter.put(
  '/media/:id/replace',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { fileBase64, filename, mimeType, url, posterUrl, width, height, duration, desktopUrl, mobileUrl } = req.body;

      let file: any;
      if (fileBase64 && filename && mimeType) {
        const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        const buffer = Buffer.from(base64Data, 'base64');
        file = { buffer, originalname: filename, mimetype: mimeType };
      }

      const updated = await MediaService.replaceMedia(id, {
        file,
        url,
        posterUrl,
        width: width !== undefined ? Number(width) : undefined,
        height: height !== undefined ? Number(height) : undefined,
        duration: duration !== undefined ? String(duration) : undefined,
        desktopUrl,
        mobileUrl,
      });

      await AuditService.log({
        restaurantId: updated.restaurantId,
        userId: req.user?.id,
        action: AuditAction.UPDATE,
        entityType: 'Media',
        entityId: updated.id,
        metadata: { url: updated.url, action: 'replace' },
      });

      res.json({ success: true, data: updated, message: 'Media replaced successfully.' });
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('file signature') ||
          err.message.includes('MIME') ||
          err.message.includes('Unsupported file extension') ||
          err.message.includes('exceeds maximum allowed'))
      ) {
        res.status(400).json({
          success: false,
          errorCode: 'INVALID_MEDIA_FILE',
          message: err.message,
        });
        return;
      }
      next(err);
    }
  }
);

// DELETE /api/media/:id
mediaRouter.delete(
  '/media/:id',
  authenticateToken,
  validateUuidParams(['id']),
  requirePermission('MANAGE_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const force = req.query.force === 'true' || req.body?.force === true;

      const deleted = await MediaService.deleteMedia(id, { force });

      await AuditService.log({
        restaurantId: deleted.restaurantId,
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'Media',
        entityId: id,
      });

      res.json({ success: true, message: 'Media record deleted successfully.' });
    } catch (err: any) {
      if (err.code === 'MEDIA_IN_USE') {
        res.status(409).json({
          success: false,
          errorCode: 'MEDIA_IN_USE',
          message: err.message,
          dishes: err.linkedDishes,
          linkedDishes: err.linkedDishes,
        });
        return;
      }
      next(err);
    }
  }
);
