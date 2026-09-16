import { Router, Request, Response, NextFunction } from 'express';
import { VideoContentType } from '@prisma/client';
import { prisma } from '../prisma';
import { requirePermission } from '../middleware/authMiddleware';
import { requireFeature } from '../middleware/featureMiddleware';
import { validateUuidParams } from '../middleware/validation';
import { VideoGenerationService } from '../services/video/videoGenerationService';
import { VideoCreditService } from '../services/video/videoCreditService';

export const aiVideoRouter = Router();

const CONTENT_TYPES = Object.values(VideoContentType);

function normalizeContentType(value: unknown): VideoContentType | null {
  if (typeof value !== 'string') return null;
  const up = value.toUpperCase();
  return (CONTENT_TYPES as string[]).includes(up) ? (up as VideoContentType) : null;
}

function sendError(res: Response, err: any): void {
  if (err?.statusCode && err?.errorCode) {
    res.status(err.statusCode).json({ success: false, errorCode: err.errorCode, message: err.message });
    return;
  }
  res.status(500).json({ success: false, errorCode: 'VIDEO_ERROR', message: err?.message || 'Unexpected error.' });
}

// GET /api/restaurants/:restaurantId/ai-video/templates — active templates + active variants
aiVideoRouter.get(
  '/restaurants/:restaurantId/ai-video/templates',
  validateUuidParams(['restaurantId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const contentType = normalizeContentType(req.query.contentType);
      const templates = await prisma.videoTemplate.findMany({
        where: { active: true, ...(contentType ? { contentType } : {}) },
        orderBy: { createdAt: 'desc' },
        include: {
          variants: { where: { active: true }, orderBy: { sortOrder: 'asc' } },
        },
      });
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/restaurants/:restaurantId/ai-video/balance
aiVideoRouter.get(
  '/restaurants/:restaurantId/ai-video/balance',
  validateUuidParams(['restaurantId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await VideoCreditService.getBalanceSummary(req.params.restaurantId);
      res.json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/restaurants/:restaurantId/ai-video/credits
aiVideoRouter.get(
  '/restaurants/:restaurantId/ai-video/credits',
  validateUuidParams(['restaurantId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ledger = await VideoCreditService.listLedger(req.params.restaurantId);
      res.json({ success: true, data: ledger });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/restaurants/:restaurantId/ai-video/jobs
aiVideoRouter.get(
  '/restaurants/:restaurantId/ai-video/jobs',
  validateUuidParams(['restaurantId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const jobs = await VideoGenerationService.listJobs(req.params.restaurantId);
      res.json({ success: true, data: jobs });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/restaurants/:restaurantId/ai-video/jobs/:jobId
aiVideoRouter.get(
  '/restaurants/:restaurantId/ai-video/jobs/:jobId',
  validateUuidParams(['restaurantId', 'jobId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('VIEW_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await VideoGenerationService.getJob(req.params.jobId, req.params.restaurantId);
      if (!job) {
        res.status(404).json({ success: false, errorCode: 'JOB_NOT_FOUND', message: 'Generation job not found.' });
        return;
      }
      res.json({ success: true, data: job });
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/restaurants/:restaurantId/ai-video/generate
aiVideoRouter.post(
  '/restaurants/:restaurantId/ai-video/generate',
  validateUuidParams(['restaurantId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('UPLOAD_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { templateId, promptVariantId, sourceMediaId, foodItemId, productName, contentType } = req.body || {};
      if (!templateId || !promptVariantId) {
        res.status(400).json({ success: false, errorCode: 'VALIDATION_ERROR', message: 'templateId and promptVariantId are required.' });
        return;
      }

      const job = await VideoGenerationService.startGeneration(req.params.restaurantId, {
        templateId: String(templateId),
        promptVariantId: String(promptVariantId),
        sourceMediaId: sourceMediaId ? String(sourceMediaId) : undefined,
        foodItemId: foodItemId ? String(foodItemId) : undefined,
        productName: productName ? String(productName) : undefined,
        contentType: contentType ? String(contentType) : undefined,
      });

      res.status(202).json({ success: true, data: job });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/restaurants/:restaurantId/ai-video/jobs/:jobId/cancel
aiVideoRouter.post(
  '/restaurants/:restaurantId/ai-video/jobs/:jobId/cancel',
  validateUuidParams(['restaurantId', 'jobId']),
  requireFeature('AI_FOOD_VIDEO'),
  requirePermission('UPLOAD_MEDIA'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const job = await VideoGenerationService.cancelGeneration(req.params.jobId, req.params.restaurantId);
      res.json({ success: true, data: job });
    } catch (err) {
      sendError(res, err);
    }
  }
);
