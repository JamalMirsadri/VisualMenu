import { randomUUID } from 'crypto';
import { MediaType, VideoJobStatus } from '@prisma/client';
import { prisma } from '../../prisma';
import { MediaService } from '../mediaService';
import { VideoCreditService } from './videoCreditService';
import { getVideoGenerationProvider } from './videoGenerationProvider';

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
    const template = job.templateId
      ? await prisma.videoTemplate.findUnique({ where: { id: job.templateId } })
      : null;

    await prisma.videoGenerationJob.update({
      where: { id: job.id },
      data: { status: VideoJobStatus.PROCESSING, startedAt: new Date() },
    });

    try {
      const provider = getVideoGenerationProvider();
      const result = await provider.submit({
        jobId: job.id,
        restaurantId: job.restaurantId,
        contentType: meta.contentType || 'OTHER',
        promptTemplate: meta.promptTemplate || '',
        negativePrompt: meta.negativePrompt,
        imageUrl: null,
        productName: meta.productName,
        restaurantName: null,
        logoUrl: null,
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
    } catch (err: any) {
      await this.failGeneration(job.id, err.message || 'Provider submission failed.');
    }
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

  /** Marks a job failed and releases its reserved credit. */
  static async failGeneration(jobId: string, error: string) {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (job.status === VideoJobStatus.COMPLETED) return job;

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
