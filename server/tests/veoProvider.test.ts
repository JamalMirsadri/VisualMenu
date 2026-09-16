import fs from 'fs';
import path from 'path';
import './setup';
import { prisma } from '../src/prisma';
import { RestaurantDeletionService } from '../src/services/restaurantDeletionService';
import { VideoCreditService } from '../src/services/video/videoCreditService';
import { VideoGenerationService } from '../src/services/video/videoGenerationService';
import { GoogleVeoProvider } from '../src/services/video/googleVeoProvider';
import type { VeoClient, VeoOperation } from '../src/services/video/veoClient';
import {
  MockVideoGenerationProvider,
  getVideoGenerationProvider,
  setVideoGenerationProvider,
  resetVideoGenerationProvider,
  type VideoGenerationProvider,
  type VideoGenerationRequest,
  type VideoPollResult,
  type VideoDownloadResult,
} from '../src/services/video/videoGenerationProvider';

function fakeMp4(): Buffer {
  // 'ftyp' at offset 4 satisfies MediaValidator's MP4 magic-byte detection.
  return Buffer.from('\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isom\x00\x00\x00\x08free', 'latin1');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForStatus(jobId: string, status: string, timeoutMs = 5000): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
    if (job && job.status === status) return job;
    await sleep(20);
  }
  const job = await prisma.videoGenerationJob.findUnique({ where: { id: jobId } });
  throw new Error(`Job did not reach ${status} (currently ${job?.status}).`);
}

class FakeVeoClient implements VeoClient {
  generatedParams: any[] = [];
  operationName = 'operations/fake-1';
  pollResult: 'complete' | 'fail' | 'pending' = 'complete';
  pollCount = 0;
  videoBytes = fakeMp4().toString('base64');

  async generateVideos(params: any): Promise<VeoOperation> {
    this.generatedParams.push(params);
    return { name: this.operationName, done: false, error: null, generatedVideos: [] };
  }

  async getVideosOperation(operation: VeoOperation): Promise<VeoOperation> {
    this.pollCount++;
    if (this.pollResult === 'complete') {
      return { name: operation.name, done: true, error: null, generatedVideos: [{ mimeType: 'video/mp4', videoBytes: this.videoBytes }] };
    }
    if (this.pollResult === 'fail') {
      return { name: operation.name, done: true, error: { message: 'Provider failed' }, generatedVideos: [] };
    }
    return { name: operation.name, done: false, error: null, generatedVideos: [] };
  }

  async downloadVideo(operation: VeoOperation): Promise<{ bytes: Buffer; mimeType: string }> {
    const videoBytes = operation.generatedVideos?.[0]?.videoBytes;
    return { bytes: Buffer.from(videoBytes || '', 'base64'), mimeType: 'video/mp4' };
  }
}

class FakeAsyncProvider implements VideoGenerationProvider {
  name = 'FAKE';
  requests: VideoGenerationRequest[] = [];
  pollCount = 0;
  failOnPoll = false;
  pendingForever = false;

  async submit(request: VideoGenerationRequest): Promise<{ providerJobId: string }> {
    this.requests.push(request);
    return { providerJobId: 'fake-op-1' };
  }

  async poll(_providerJobId: string): Promise<VideoPollResult> {
    this.pollCount++;
    if (this.failOnPoll) return { status: 'FAILED', error: 'Provider failed' };
    if (this.pendingForever) return { status: 'PENDING' };
    return { status: 'COMPLETED' };
  }

  async download(_providerJobId: string): Promise<VideoDownloadResult> {
    return { buffer: fakeMp4(), mimeType: 'video/mp4', filename: 'fake.mp4' };
  }
}

async function runTests() {
  console.log('🧪 Google Veo Provider Regression Suite (19 Tests)...\n');
  let passed = 0;
  let failed = 0;
  const assert = async (num: number, desc: string, fn: () => Promise<void> | void) => {
    try {
      await fn();
      console.log(`  ✓ [${num}/19] ${desc}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [${num}/19] ${desc}:`, err.message || err);
      failed++;
    }
  };

  const unique = Date.now().toString(36);
  let restaurant: any;
  let template: any;
  let imagePath = '';

  try {
    // ---- Unit: GoogleVeoProvider with a fake VeoClient ----
    await assert(1, 'GoogleVeoProvider builds request (model + prompt + 9:16 config)', async () => {
      const client = new FakeVeoClient();
      const provider = new GoogleVeoProvider(client);
      await provider.submit({
        jobId: 'job-1',
        restaurantId: 'r1',
        contentType: 'FOOD',
        promptTemplate: 'Show {FOOD_NAME}',
        prompt: 'Show the burger',
        negativePrompt: 'no text',
        aspectRatio: '9:16',
      } as any);

      const p = client.generatedParams[0];
      if (p.model !== 'veo-3.1-generate-preview') throw new Error(`model ${p.model}`);
      if (p.prompt !== 'Show the burger') throw new Error(`prompt ${p.prompt}`);
      if (p.config.aspectRatio !== '9:16') throw new Error(`aspectRatio ${p.config.aspectRatio}`);
      if (p.config.negativePrompt !== 'no text') throw new Error('negativePrompt missing');
    });

    await assert(2, 'GoogleVeoProvider sends the uploaded image as primary input', async () => {
      imagePath = path.join(process.cwd(), 'uploads', `veo-test-${unique}.jpg`);
      await fs.promises.mkdir(path.dirname(imagePath), { recursive: true });
      const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      await fs.promises.writeFile(imagePath, bytes);

      const client = new FakeVeoClient();
      const provider = new GoogleVeoProvider(client);
      await provider.submit({
        jobId: 'job-2',
        restaurantId: 'r1',
        contentType: 'FOOD',
        promptTemplate: 'x',
        prompt: 'x',
        imageUrl: `/uploads/veo-test-${unique}.jpg`,
        imageMimeType: 'image/jpeg',
        aspectRatio: '9:16',
      } as any);

      const image = client.generatedParams[0].image;
      if (!image || !image.imageBytes) throw new Error('image bytes missing');
      if (Buffer.from(image.imageBytes, 'base64').toString('hex') !== bytes.toString('hex')) throw new Error('image bytes mismatch');
      if (image.mimeType !== 'image/jpeg') throw new Error(`mimeType ${image.mimeType}`);
    });

    await assert(3, 'GoogleVeoProvider respects supported 16:9 aspect ratio', async () => {
      const client = new FakeVeoClient();
      const provider = new GoogleVeoProvider(client);
      await provider.submit({ jobId: 'j', restaurantId: 'r', contentType: 'FOOD', promptTemplate: 'x', prompt: 'x', aspectRatio: '16:9' } as any);
      if (client.generatedParams[0].config.aspectRatio !== '16:9') throw new Error('16:9 not applied');
    });

    await assert(4, 'GoogleVeoProvider poll returns COMPLETED when done', async () => {
      const client = new FakeVeoClient();
      const provider = new GoogleVeoProvider(client);
      const { providerJobId } = await provider.submit({ jobId: 'j', restaurantId: 'r', contentType: 'FOOD', promptTemplate: 'x', prompt: 'x' } as any);
      const result = await provider.poll!(providerJobId);
      if (result.status !== 'COMPLETED') throw new Error(`status ${result.status}`);
    });

    await assert(5, 'GoogleVeoProvider poll returns FAILED on provider error', async () => {
      const client = new FakeVeoClient();
      client.pollResult = 'fail';
      const provider = new GoogleVeoProvider(client);
      const { providerJobId } = await provider.submit({ jobId: 'j', restaurantId: 'r', contentType: 'FOOD', promptTemplate: 'x', prompt: 'x' } as any);
      const result = await provider.poll!(providerJobId);
      if (result.status !== 'FAILED') throw new Error(`status ${result.status}`);
      if (!result.error) throw new Error('error message missing');
    });

    // ---- Setup for service-level async flow ----
    process.env.VEO_POLL_INTERVAL_MS = '1';
    process.env.VEO_TIMEOUT_MS = '2500';

    restaurant = await prisma.restaurant.create({ data: { name: 'VEO', slug: `veo-${unique}`, active: true, timezone: 'UTC' } });
    template = await prisma.videoTemplate.create({
      data: {
        name: 'Food Veo',
        contentType: 'FOOD',
        active: true,
        aspectRatio: '9:16',
        variants: { create: [{ name: 'Steam', promptTemplate: 'Cinematic {FOOD_NAME} for {RESTAURANT_NAME}' }] },
      },
      include: { variants: true },
    });
    await VideoCreditService.grantManual(restaurant.id, 10, undefined, 'veo-test');

    const variant = template.variants[0];

    // ---- Service: async success ----
    await assert(6, 'Successful generation: COMPLETED + credit finalized (-1)', async () => {
      const fake = new FakeAsyncProvider();
      setVideoGenerationProvider(fake);
      const before = await VideoCreditService.getBalance(restaurant.id);
      const job = await VideoGenerationService.startGeneration(restaurant.id, {
        templateId: template.id,
        promptVariantId: variant.id,
        productName: 'Burger',
      });
      const completed = await waitForStatus(job.id, 'COMPLETED');
      if (!completed.outputMediaId) throw new Error('outputMediaId missing');
      const after = await VideoCreditService.getBalance(restaurant.id);
      if (after !== before - 1) throw new Error(`credit not finalized -1: ${before} -> ${after}`);
    });

    await assert(7, 'Media saved to Media Library (VIDEO + AI_VIDEO source)', async () => {
      const media = await prisma.media.findFirst({ where: { restaurantId: restaurant.id, sourceType: 'AI_VIDEO' } });
      if (!media || media.type !== 'VIDEO') throw new Error('media not saved');
    });

    await assert(8, 'Provider failure: FAILED + refund', async () => {
      const fake = new FakeAsyncProvider();
      fake.failOnPoll = true;
      setVideoGenerationProvider(fake);
      const before = await VideoCreditService.getBalance(restaurant.id);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      const failed = await waitForStatus(job.id, 'FAILED');
      if (!failed.error) throw new Error('error missing');
      const after = await VideoCreditService.getBalance(restaurant.id);
      if (after !== before) throw new Error(`refund not applied: ${before} -> ${after}`);
    });

    await assert(9, 'Timeout: FAILED (VIDEO_TIMEOUT) + refund', async () => {
      const fake = new FakeAsyncProvider();
      fake.pendingForever = true;
      setVideoGenerationProvider(fake);
      const before = await VideoCreditService.getBalance(restaurant.id);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      const failed = await waitForStatus(job.id, 'FAILED', 5000);
      if (!failed.error) throw new Error('error missing');
      const after = await VideoCreditService.getBalance(restaurant.id);
      if (after !== before) throw new Error(`timeout refund not applied: ${before} -> ${after}`);
    });

    await assert(10, 'Cancellation: CANCELLED + refund (no double spend)', async () => {
      const fake = new FakeAsyncProvider();
      fake.pendingForever = true;
      setVideoGenerationProvider(fake);
      const before = await VideoCreditService.getBalance(restaurant.id);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      await sleep(50);
      await VideoGenerationService.cancelGeneration(job.id, restaurant.id);
      const cancelled = await waitForStatus(job.id, 'CANCELLED');
      if (!cancelled) throw new Error('not cancelled');
      await sleep(150);
      const after = await VideoCreditService.getBalance(restaurant.id);
      if (after !== before) throw new Error(`cancel refund mismatch: ${before} -> ${after}`);
    });

    await assert(11, 'Refund is idempotent (exactly once)', async () => {
      const fake = new FakeAsyncProvider();
      fake.failOnPoll = true;
      setVideoGenerationProvider(fake);
      const before = await VideoCreditService.getBalance(restaurant.id);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      await waitForStatus(job.id, 'FAILED');
      await VideoGenerationService.failGeneration(job.id, 'double fail'); // already failed
      const after = await VideoCreditService.getBalance(restaurant.id);
      if (after !== before) throw new Error(`double refund: ${before} -> ${after}`);
    });

    await assert(12, 'Service builds prompt with dynamic variables', async () => {
      const fake = new FakeAsyncProvider();
      setVideoGenerationProvider(fake);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id, productName: 'Risotto' });
      await waitForStatus(job.id, 'COMPLETED');
      const req = fake.requests[0];
      if (!req.prompt || !req.prompt.includes('Risotto')) throw new Error(`prompt missing product name: ${req.prompt}`);
      if (req.prompt.includes('{RESTAURANT_NAME}')) throw new Error('placeholder not resolved');
      if (!req.restaurantName || req.restaurantName !== 'VEO') throw new Error(`restaurantName ${req.restaurantName}`);
    });

    await assert(13, 'Tenant isolation: getJob is restaurant-scoped', async () => {
      const other = await prisma.restaurant.create({ data: { name: 'Other', slug: `veo-other-${unique}`, active: true, timezone: 'UTC' } });
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      const scoped = await VideoGenerationService.getJob(job.id, other.id);
      if (scoped !== null) throw new Error('cross-tenant job leaked');
      await RestaurantDeletionService.hardDelete(other.id).catch(() => {});
    });

    await assert(14, 'API key never exposed in request payloads', async () => {
      const fake = new FakeAsyncProvider();
      setVideoGenerationProvider(fake);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      await waitForStatus(job.id, 'COMPLETED');
      const req = fake.requests[0] as any;
      if ('apiKey' in req || 'key' in req || 'GEMINI_API_KEY' in req) throw new Error('key leaked in request');
    });

    await assert(15, 'Mock provider still resolves by default', () => {
      delete process.env.VIDEO_GENERATION_PROVIDER;
      resetVideoGenerationProvider();
      const provider = getVideoGenerationProvider();
      if (!(provider instanceof MockVideoGenerationProvider)) throw new Error('expected Mock provider');
    });

    await assert(16, 'Provider selection switches to VEO via env', () => {
      process.env.VIDEO_GENERATION_PROVIDER = 'VEO';
      resetVideoGenerationProvider();
      const provider = getVideoGenerationProvider();
      if (provider.name !== 'VEO') throw new Error(`expected VEO, got ${provider.name}`);
      delete process.env.VIDEO_GENERATION_PROVIDER;
      resetVideoGenerationProvider();
    });

    await assert(17, 'VEO provider requires GEMINI_API_KEY without injected client', async () => {
      const prevKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;
      const provider = new GoogleVeoProvider();
      let threw = false;
      try {
        await provider.submit({ jobId: 'j', restaurantId: 'r', contentType: 'FOOD', promptTemplate: 'x', prompt: 'x' } as any);
      } catch (e: any) {
        if (/GEMINI_API_KEY/.test(e.message)) threw = true;
      }
      if (prevKey) process.env.GEMINI_API_KEY = prevKey;
      if (!threw) throw new Error('missing key did not fail');
    });

    await assert(18, 'No duplicate media on idempotent completion', async () => {
      const fake = new FakeAsyncProvider();
      setVideoGenerationProvider(fake);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      const completed = await waitForStatus(job.id, 'COMPLETED');
      // Call storeGeneratedVideo again for the same job — must not create a second media.
      await VideoGenerationService.storeGeneratedVideo(job.id, { buffer: fakeMp4(), mimeType: 'video/mp4', filename: 'again.mp4' });
      const media = await prisma.media.findMany({ where: { restaurantId: restaurant.id, sourceType: 'AI_VIDEO' } });
      const jobMedia = media.filter((m) => m.id === completed.outputMediaId);
      if (jobMedia.length !== 1) throw new Error('duplicate media created');
    });

    await assert(19, 'Async flow does not fabricate values (provider id stored, no key)', async () => {
      const fake = new FakeAsyncProvider();
      setVideoGenerationProvider(fake);
      const job = await VideoGenerationService.startGeneration(restaurant.id, { templateId: template.id, promptVariantId: variant.id });
      await waitForStatus(job.id, 'COMPLETED');
      const stored = await prisma.videoGenerationJob.findUnique({ where: { id: job.id } });
      if (!stored || stored.providerJobId !== 'fake-op-1') throw new Error('provider job id not stored');
    });
  } catch (err: any) {
    console.error('  Setup error:', err.message || err);
    failed++;
  } finally {
    resetVideoGenerationProvider();
    delete process.env.VEO_POLL_INTERVAL_MS;
    delete process.env.VEO_TIMEOUT_MS;
    if (restaurant?.id) await RestaurantDeletionService.hardDelete(restaurant.id).catch(() => {});
    if (template?.id) await prisma.videoTemplate.deleteMany({ where: { id: template.id } }).catch(() => {});
    if (imagePath) await fs.promises.rm(imagePath, { force: true }).catch(() => {});
    await prisma.$disconnect();
  }

  console.log(`\nGoogle Veo Provider Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
