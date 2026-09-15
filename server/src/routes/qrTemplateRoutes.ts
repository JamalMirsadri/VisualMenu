import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { PlatformRole, QrPrintLayout, AuditAction } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { getStorageProvider } from '../services/storageProvider';
import { extractStorageKey } from '../config';
import { AuditService } from '../services/auditService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function normalizeLayout(layout?: string): QrPrintLayout {
  return layout === 'A4' ? QrPrintLayout.A4 : QrPrintLayout.CARD;
}

// -----------------------------------------------------------------------------
// Platform template management — mounted at /api/platform (PLATFORM_ADMIN only)
// -----------------------------------------------------------------------------
export const qrTemplateRouter = Router();
qrTemplateRouter.use(requirePlatformRole(PlatformRole.PLATFORM_ADMIN));

// GET /api/platform/qr-templates
qrTemplateRouter.get('/qr-templates', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const templates = await prisma.qrPrintTemplate.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/qr-templates
qrTemplateRouter.post('/qr-templates', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, layout, backgroundUrl } = req.body || {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'Template name is required.' });
      return;
    }

    const template = await prisma.qrPrintTemplate.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        backgroundUrl: backgroundUrl ? String(backgroundUrl).trim() : null,
        layout: normalizeLayout(layout),
        active: true,
        createdById: req.user?.id || null,
      },
    });

    await AuditService.log({
      userId: req.user?.id,
      action: AuditAction.CREATE,
      entityType: 'QrPrintTemplate',
      entityId: template.id,
      metadata: { name: template.name, layout: template.layout },
    });

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/qr-templates/upload — upload a fixed background/design asset
qrTemplateRouter.post(
  '/qr-templates/upload',
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let buffer: Buffer;
      let filename: string;
      let mimetype: string;

      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname;
        mimetype = req.file.mimetype;
      } else {
        const { fileBase64, filename: baseFilename, mimeType: baseMimeType } = req.body || {};
        if (!fileBase64 || !baseFilename || !baseMimeType) {
          res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'A file is required.' });
          return;
        }
        const base64Data = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
        buffer = Buffer.from(base64Data, 'base64');
        filename = baseFilename;
        mimetype = baseMimeType;
      }

      const result = await getStorageProvider().upload(
        { buffer, originalname: filename, mimetype },
        { folder: 'platform/qr-templates' }
      );

      res.status(201).json({ success: true, data: { url: result.url, key: result.key, size: result.size, mimeType: result.mimeType } });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/platform/qr-templates/:id — edit name/description/layout/backgroundUrl
qrTemplateRouter.patch(
  '/qr-templates/:id',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.qrPrintTemplate.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
        return;
      }

      const { name, description, layout, backgroundUrl } = req.body || {};
      const data: any = {};
      if (name !== undefined) data.name = String(name).trim();
      if (description !== undefined) data.description = description ? String(description).trim() : null;
      if (layout !== undefined) data.layout = normalizeLayout(layout);
      if (backgroundUrl !== undefined) data.backgroundUrl = backgroundUrl ? String(backgroundUrl).trim() : null;

      const updated = await prisma.qrPrintTemplate.update({ where: { id }, data });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// PATCH /api/platform/qr-templates/:id/toggle — enable/disable
qrTemplateRouter.patch(
  '/qr-templates/:id/toggle',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.qrPrintTemplate.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
        return;
      }

      const updated = await prisma.qrPrintTemplate.update({
        where: { id },
        data: { active: !existing.active },
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// DELETE /api/platform/qr-templates/:id
qrTemplateRouter.delete(
  '/qr-templates/:id',
  validateUuidParams(['id']),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const existing = await prisma.qrPrintTemplate.findUnique({ where: { id } });
      if (!existing) {
        res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
        return;
      }

      const key = extractStorageKey(existing.backgroundUrl);
      if (key) {
        await getStorageProvider().delete(key).catch(() => {});
      }

      await prisma.qrPrintTemplate.delete({ where: { id } });

      await AuditService.log({
        userId: req.user?.id,
        action: AuditAction.DELETE,
        entityType: 'QrPrintTemplate',
        entityId: id,
        metadata: { name: existing.name },
      });

      res.json({ success: true, message: 'Template deleted successfully.' });
    } catch (err) {
      next(err);
    }
  }
);

// -----------------------------------------------------------------------------
// Restaurant active-template listing — mounted at /api (authenticated)
// -----------------------------------------------------------------------------
export const qrTemplateRestaurantRouter = Router();

// GET /api/qr-templates/active
qrTemplateRestaurantRouter.get('/qr-templates/active', async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const templates = await prisma.qrPrintTemplate.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
});
