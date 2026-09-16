import { randomUUID } from 'crypto';
import { MediaType, VideoJobStatus } from '@prisma/client';
import { prisma } from '../../prisma';
import { MediaService } from '../mediaService';
import { VideoCreditService } from './videoCreditService';
import { getVideoGenerationProvider, type VideoGenerationProvider, type VideoPollResult } from './videoGenerationProvider';
import { getVeoPollIntervalMs, getVeoTimeoutMs } from './videoConfig';

export interface StartGenerationInput {
  templateId: string;
  promptVariantId: string;
  sourceMediaId?: string;
  foodItemId?: string;
  productName?: string;
  contentType?: string;
}

export interface CompleteGenerationOutput {
  url: string;
  mimeType?: string;
  filename?: string;
  duration?: string;
  width?: number;
  height?: number;
  posterUrl?: string;
  thumbnailUrl?: string;
}

export interface StoredGenerationOutput {
  buffer: Buffer;
  mimeType?: string;
  filename?: string;
  duration?: string;
}

function buildPrompt(template: string, vars: Record<string, string>): string {
  let out = template || '';
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value || '');
  }
  return out.trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VideoGenerationError extends Error {
  errorCode: string;
  statusCode: number;
  constructor(message: string, errorCode = 'VIDEO_GENERATION_ERROR', statusCode = 400) {
    super(message);
    this.errorCode = errorCode;
    this.statusCode = statusCode;
  }
}

export class VideoGenerationService {
  /**
   * Starts an asynchronous generation: validates assets, reserves one credit,
   * creates a QUEUED job, and dispatches provider submission without blocking.
   */
  static async startGeneration(restaurantId: string, input: StartGenerationInput) {
    const template = await prisma.videoTemplate.findUnique({
      where: { id: input.templateId },
      include: { variants: true },
    });
    if (!template || !template.active) {
      throw new VideoGenerationError('Template not found or inactive.', 'TEMPLATE_NOT_FOUND', 404);
    }

    if (input.contentType && template.contentType !== input.contentType) {
      throw new VideoGenerationError('Template does not match the selected content type.', 'CONTENT_TYPE_MISMATCH');
    }

    const variant = template.variants.find((v) => v.id === input.promptVariantId && v.active);
    if (!variant) {
      throw new VideoGenerationError('Prompt variant not found or inactive for this template.', 'VARIANT_NOT_FOUND', 404);
    }

    // Validate source media tenant isolation when provided.
    if (input.sourceMediaId) {
      const media = await prisma.media.findFirst({ where: { id: input.sourceMediaId, restaurantId } });
      if (!media) {
        throw new VideoGenerationError('Source media not found.', 'SOURCE_MEDIA_NOT_FOUND', 404);
      }
    }

    let foodItemId: string | null = null;
    if (input.foodItemId) {
      const food = await prisma.foodItem.findFirst({ where: { id: input.foodItemId, restaurantId } });
      if (!food) {
        throw new VideoGenerationError('Food item not found.', 'FOOD_NOT_FOUND', 404);
      }
      foodItemId = food.id;
    }

    // Reserve exactly one credit (throws INSUFFICIENT_VIDEO_CREDITS when empty).
    const jobId = randomUUID();
    const creditTxId = await VideoCreditService.reserveCredit(restaurantId, `job:${jobId}`);

    const job = await prisma.videoGenerationJob.create({
      data: {
        id: jobId,
        restaurantId,
        templateId: template.id,
        promptVariantId: variant.id,
        sourceMediaId: input.sourceMediaId || null,
        creditTxId,
        status: VideoJobStatus.QUEUED,
        metadata: {
          contentType: template.contentType,
          productName: input.productName || null,
          foodItemId,
          promptTemplate: variant.promptTemplate,
          negativePrompt: variant.negativePrompt,
        },
      },
    });

    // Dispatch provider submission asynchronously; never block the HTTP request.
    setImmediate(() => {
      this.dispatchToProvider(job.id).catch((err) => {
        console.error(`[VideoGeneration] dispatch failed for job ${job.id}:`, err);
      });
    });

    return job;
  }

  private static async dispatchToProvider(jobId: string): Promise<void> {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job || job.status !== VideoJobStatus.QUEUED) return;

    const meta = (job.metadata || {}) as any;
    const [template, restaurant, sourceMedia] = await Promise.all([
      job.templateId ? prisma.videoTemplate.findUnique({ where: { id: job.templateId } }) : null,
      prisma.restaurant.findUnique({ where: { id: job.restaurantId }, select: { id: true, name: true, logo: true } }),
      job.sourceMediaId ? prisma.media.findUnique({ where: { id: job.sourceMediaId }, select: { url: true, mimeType: true } }) : null,
    ]);

    await prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: VideoJobStatus.PROCESSING, startedAt: new Date() },
    });

    const prompt = buildPrompt(meta.promptTemplate || '', {
      FOOD_IMAGE: 'the provided food image',
      FOOD_NAME: meta.productName || 'the dish',
      CATEGORY: (meta.contentType || '').toLowerCase(),
      RESTAURANT_NAME: restaurant?.name || '',
      LOGO: 'the restaurant logo',
    });

    try {
      const provider = getVideoGenerationProvider();
      const result = await provider.submit({
        jobId: job.id,
        restaurantId: job.restaurantId,
        contentType: meta.contentType || 'OTHER',
        promptTemplate: meta.promptTemplate || '',
        prompt,
        negativePrompt: meta.negativePrompt,
        imageUrl: sourceMedia?.url || null,
        imageMimeType: sourceMedia?.mimeType || null,
        productName: meta.productName,
        restaurantName: restaurant?.name || null,
        logoUrl: restaurant?.logo || null,
        model: template?.model,
        aspectRatio: template?.aspectRatio,
        duration: template?.duration,
        backgroundAsset: template?.backgroundAsset,
        styleConfig: template?.styleConfig,
        cameraConfig: template?.cameraConfig,
        lightingConfig: template?.lightingConfig,
        motionConfig: template?.motionConfig,
      });

      await prisma.videoGenerationJob.update({
        where: { id: job.id },
        data: { providerJobId: result.providerJobId },
      });

      if (typeof provider.poll === 'function' && typeof provider.download === 'function') {
        const download = await this.pollForCompletion(provider, job.id, result.providerJobId);
        const current = await prisma.videoGenerationJob.findUnique({ where: { id: job.id } });
        if (!current || current.status === VideoJobStatus.CANCELLED) return;
        await this.storeGeneratedVideo(job.id, {
          buffer: download.buffer,
          mimeType: download.mimeType,
          filename: download.filename,
          duration: template?.duration ? String(template.duration) : undefined,
        });
      }
    } catch (err: any) {
      if (err?.errorCode === 'VIDEO_CANCELLED') return;
      await this.failGeneration(job.id, err.message || 'Provider submission failed.');
    }
  }

  private static async pollForCompletion(
    provider: VideoGenerationProvider,
    jobId: string,
    providerJobId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const deadline = Date.now() + getVeoTimeoutMs();

    while (Date.now() < deadline) {
      const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
      if (!job || job.status === VideoJobStatus.CANCELLED) {
        const err: any = new Error('Generation cancelled.');
        err.errorCode = 'VIDEO_CANCELLED';
        throw err;
      }

      await sleep(getVeoPollIntervalMs());

      const pollResult = await this.pollWithRetry(provider, providerJobId);

      if (pollResult.status === 'COMPLETED') {
        return provider.download!(providerJobId);
      }
      if (pollResult.status === 'FAILED') {
        throw new VideoGenerationError(pollResult.error || 'Provider operation failed.', 'PROVIDER_FAILED');
      }
    }

    throw new VideoGenerationError('Video generation timed out.', 'VIDEO_TIMEOUT');
  }

  private static async pollWithRetry(provider: VideoGenerationProvider, providerJobId: string, maxRetries = 3): Promise<VideoPollResult> {
    let lastError: any;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await provider.poll!(providerJobId);
      } catch (err) {
        lastError = err;
        await sleep(getVeoPollIntervalMs());
      }
    }
    throw new VideoGenerationError(`Provider polling failed: ${lastError?.message || 'unknown error'}`, 'PROVIDER_POLL_FAILED');
  }

  /**
   * Finalizes a successful generation and persists the output through the
   * existing Media Library. On storage failure the reserved credit is refunded.
   */
  static async completeGeneration(jobId: string, output: CompleteGenerationOutput) {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new VideoGenerationError('Generation job not found.', 'JOB_NOT_FOUND', 404);
    }
    if (job.status === VideoJobStatus.COMPLETED) return job;

    const meta = (job.metadata || {}) as any;

    try {
      const media = await MediaService.createMedia({
        restaurantId: job.restaurantId,
        foodItemId: meta.foodItemId || null,
        type: MediaType.VIDEO,
        url: output.url,
        thumbnailUrl: output.thumbnailUrl,
        filename: output.filename,
        mimeType: output.mimeType,
        duration: output.duration,
        width: output.width,
        height: output.height,
        posterUrl: output.posterUrl,
        sourceType: 'AI_VIDEO',
      });

      return await prisma.videoGenerationJob.update({
        where: { id: job.id },
        data: {
          status: VideoJobStatus.COMPLETED,
          outputMediaId: media.id,
          completedAt: new Date(),
          error: null,
        },
      });
    } catch (err: any) {
      await this.failGeneration(job.id, `Output storage failed: ${err.message || 'unknown error'}`);
      throw err;
    }
  }

  /** Uploads a generated MP4 buffer through the existing Media Library. */
  static async storeGeneratedVideo(jobId: string, output: StoredGenerationOutput) {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) {
      throw new VideoGenerationError('Generation job not found.', 'JOB_NOT_FOUND', 404);
    }
    if (job.status === VideoJobStatus.COMPLETED) return job;
    if (job.status === VideoJobStatus.CANCELLED) return job;

    const meta = (job.metadata || {}) as any;

    try {
      const media = await MediaService.uploadAndCreateMedia(
        job.restaurantId,
        {
          buffer: output.buffer,
          originalname: output.filename || 'generated.mp4',
          mimetype: output.mimeType || 'video/mp4',
        },
        {
          foodItemId: meta.foodItemId || null,
          duration: output.duration,
          sourceType: 'AI_VIDEO',
        }
      );

      return await prisma.videoGenerationJob.update({
        where: { id: job.id },
        data: {
          status: VideoJobStatus.COMPLETED,
          outputMediaId: media.id,
          completedAt: new Date(),
          error: null,
        },
      });
    } catch (err: any) {
      await this.failGeneration(job.id, `Output storage failed: ${err.message || 'unknown error'}`);
      throw err;
    }
  }

  /** Marks a job failed and releases its reserved credit (exactly once). */
  static async failGeneration(jobId: string, error: string) {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (job.status === VideoJobStatus.COMPLETED || job.status === VideoJobStatus.CANCELLED) return job;

    await prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: VideoJobStatus.FAILED, error: error || 'Generation failed.', completedAt: new Date() },
    });

    await VideoCreditService.refundCredit(job.restaurantId, `job:${job.id}`);
    return job;
  }

  /** Cancels a queued/processing job and releases its reserved credit. */
  static async cancelGeneration(jobId: string, restaurantId: string) {
    const job = await prisma.videoGenerationJob.findFirst({ where: { id: jobId, restaurantId } });
    if (!job) {
      throw new VideoGenerationError('Generation job not found.', 'JOB_NOT_FOUND', 404);
    }
    if (job.status === VideoJobStatus.COMPLETED || job.status === VideoJobStatus.CANCELLED || job.status === VideoJobStatus.FAILED) {
      return job;
    }

    const updated = await prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: VideoJobStatus.CANCELLED, completedAt: new Date() },
    });

    await VideoCreditService.refundCredit(job.restaurantId, `job:${job.id}`);
    return updated;
  }

  static async getJob(jobId: string, restaurantId: string) {
    return prisma.videoGenerationJob.findFirst({
      where: { id: jobId, restaurantId },
      include: { template: true, promptVariant: true, outputMedia: true },
    });
  }

  static async listJobs(restaurantId: string) {
    return prisma.videoGenerationJob.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
      include: { template: true, promptVariant: true, outputMedia: true },
    });
  }
}
