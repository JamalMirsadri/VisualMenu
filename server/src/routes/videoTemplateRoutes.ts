import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { PlatformRole, VideoContentType, AuditAction } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePlatformRole } from '../middleware/authMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { getStorageProvider } from '../services/storageProvider';
import { extractStorageKey } from '../config';
import { AuditService } from '../services/auditService';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const CONTENT_TYPES = Object.values(VideoContentType);

function normalizeContentType(value: unknown): VideoContentType | null {
  if (typeof value !== 'string') return null;
  const up = value.toUpperCase();
  return (CONTENT_TYPES as string[]).includes(up) ? (up as VideoContentType) : null;
}

// -----------------------------------------------------------------------------
// Platform template management — mounted at /api/platform (PLATFORM_ADMIN only)
// -----------------------------------------------------------------------------
export const videoTemplateRouter = Router();
videoTemplateRouter.use(requirePlatformRole(PlatformRole.PLATFORM_ADMIN));

// GET /api/platform/video-templates
videoTemplateRouter.get('/video-templates', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const contentType = normalizeContentType(req.query.contentType);
    const templates = await prisma.videoTemplate.findMany({
      where: contentType ? { contentType } : {},
      orderBy: { createdAt: 'desc' },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    res.json({ success: true, data: templates });
  } catch (err) {
    next(err);
  }
});

// GET /api/platform/video-templates/:id
videoTemplateRouter.get('/video-templates/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const template = await prisma.videoTemplate.findUnique({
      where: { id: req.params.id },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) {
      res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
      return;
    }
    res.json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/video-templates
videoTemplateRouter.post('/video-templates', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, description, contentType, aspectRatio, duration, provider, model, backgroundAsset, styleConfig, cameraConfig, lightingConfig, motionConfig, variants } = req.body || {};
    if (!name || !String(name).trim()) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'Template name is required.' });
      return;
    }
    const type = normalizeContentType(contentType);
    if (!type) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: `contentType must be one of: ${CONTENT_TYPES.join(', ')}` });
      return;
    }

    const template = await prisma.videoTemplate.create({
      data: {
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        contentType: type,
        aspectRatio: aspectRatio ? String(aspectRatio) : '9:16',
        duration: duration !== undefined ? Number(duration) || null : null,
        provider: provider ? String(provider) : 'VEO',
        model: model ? String(model) : null,
        backgroundAsset: backgroundAsset ? String(backgroundAsset) : null,
        styleConfig: styleConfig ?? undefined,
        cameraConfig: cameraConfig ?? undefined,
        lightingConfig: lightingConfig ?? undefined,
        motionConfig: motionConfig ?? undefined,
        active: true,
        version: 1,
        createdById: req.user?.id || null,
        variants: Array.isArray(variants)
          ? {
              create: variants.map((v: any, i: number) => ({
                name: String(v.name || `Variant ${i + 1}`),
                promptTemplate: String(v.promptTemplate || ''),
                negativePrompt: v.negativePrompt ? String(v.negativePrompt) : null,
                active: v.active !== false,
                version: 1,
                sortOrder: v.sortOrder !== undefined ? Number(v.sortOrder) : i,
              })),
            }
          : undefined,
      },
      include: { variants: true },
    });

    await AuditService.log({
      userId: req.user?.id,
      action: AuditAction.CREATE,
      entityType: 'VideoTemplate',
      entityId: template.id,
      metadata: { name: template.name, contentType: template.contentType },
    });

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/video-templates/upload — upload a fixed background asset
videoTemplateRouter.post('/video-templates/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
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
      { folder: 'platform/video-templates' }
    );

    res.status(201).json({ success: true, data: { url: result.url, key: result.key, size: result.size, mimeType: result.mimeType } });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/platform/video-templates/:id
videoTemplateRouter.patch('/video-templates/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
      return;
    }

    const { name, description, contentType, aspectRatio, duration, provider, model, backgroundAsset, styleConfig, cameraConfig, lightingConfig, motionConfig } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (contentType !== undefined) {
      const type = normalizeContentType(contentType);
      if (!type) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: `contentType must be one of: ${CONTENT_TYPES.join(', ')}` });
        return;
      }
      data.contentType = type;
    }
    if (aspectRatio !== undefined) data.aspectRatio = String(aspectRatio);
    if (duration !== undefined) data.duration = duration ? Number(duration) : null;
    if (provider !== undefined) data.provider = provider ? String(provider) : null;
    if (model !== undefined) data.model = model ? String(model) : null;
    if (backgroundAsset !== undefined) data.backgroundAsset = backgroundAsset ? String(backgroundAsset) : null;
    if (styleConfig !== undefined) data.styleConfig = styleConfig;
    if (cameraConfig !== undefined) data.cameraConfig = cameraConfig;
    if (lightingConfig !== undefined) data.lightingConfig = lightingConfig;
    if (motionConfig !== undefined) data.motionConfig = motionConfig;

    const updated = await prisma.videoTemplate.update({
      where: { id: req.params.id },
      data: { ...data, version: { increment: 1 } },
      include: { variants: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/platform/video-templates/:id/toggle
videoTemplateRouter.patch('/video-templates/:id/toggle', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
      return;
    }
    const updated = await prisma.videoTemplate.update({ where: { id: existing.id }, data: { active: !existing.active } });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/platform/video-templates/:id
videoTemplateRouter.delete('/video-templates/:id', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
      return;
    }

    const key = extractStorageKey(existing.backgroundAsset);
    if (key) await getStorageProvider().delete(key).catch(() => {});

    await prisma.videoTemplate.delete({ where: { id: existing.id } });

    await AuditService.log({
      userId: req.user?.id,
      action: AuditAction.DELETE,
      entityType: 'VideoTemplate',
      entityId: existing.id,
      metadata: { name: existing.name },
    });

    res.json({ success: true, message: 'Template deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/platform/video-templates/:id/variants
videoTemplateRouter.post('/video-templates/:id/variants', validateUuidParams(['id']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const template = await prisma.videoTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) {
      res.status(404).json({ success: false, errorCode: 'TEMPLATE_NOT_FOUND', message: 'Template not found.' });
      return;
    }
    const { name, promptTemplate, negativePrompt, sortOrder } = req.body || {};
    if (!name || !promptTemplate) {
      res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'name and promptTemplate are required.' });
      return;
    }

    const variant = await prisma.videoTemplatePromptVariant.create({
      data: {
        templateId: template.id,
        name: String(name).trim(),
        promptTemplate: String(promptTemplate),
        negativePrompt: negativePrompt ? String(negativePrompt) : null,
        active: true,
        version: 1,
        sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
      },
    });

    res.status(201).json({ success: true, data: variant });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/platform/video-templates/:id/variants/:variantId
videoTemplateRouter.patch('/video-templates/:id/variants/:variantId', validateUuidParams(['id', 'variantId']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const variant = await prisma.videoTemplatePromptVariant.findFirst({
      where: { id: req.params.variantId, templateId: req.params.id },
    });
    if (!variant) {
      res.status(404).json({ success: false, errorCode: 'VARIANT_NOT_FOUND', message: 'Prompt variant not found.' });
      return;
    }
    const { name, promptTemplate, negativePrompt, active, sortOrder } = req.body || {};
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim();
    if (promptTemplate !== undefined) data.promptTemplate = String(promptTemplate);
    if (negativePrompt !== undefined) data.negativePrompt = negativePrompt ? String(negativePrompt) : null;
    if (active !== undefined) data.active = Boolean(active);
    if (sortOrder !== undefined) data.sortOrder = Number(sortOrder);

    const updated = await prisma.videoTemplatePromptVariant.update({
      where: { id: variant.id },
      data: { ...data, version: { increment: 1 } },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/platform/video-templates/:id/variants/:variantId
videoTemplateRouter.delete('/video-templates/:id/variants/:variantId', validateUuidParams(['id', 'variantId']), async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const variant = await prisma.videoTemplatePromptVariant.findFirst({
      where: { id: req.params.variantId, templateId: req.params.id },
    });
    if (!variant) {
      res.status(404).json({ success: false, errorCode: 'VARIANT_NOT_FOUND', message: 'Prompt variant not found.' });
      return;
    }
    await prisma.videoTemplatePromptVariant.delete({ where: { id: variant.id } });
    res.json({ success: true, message: 'Prompt variant deleted.' });
  } catch (err) {
    next(err);
  }
});
