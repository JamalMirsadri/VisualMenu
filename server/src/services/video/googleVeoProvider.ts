import fs from 'fs';
import path from 'path';
import { extractStorageKey } from '../../config';
import { GEMINI_API_KEY, VEO_MODEL, VEO_SUPPORTED_ASPECT_RATIOS, VEO_SUPPORTED_DURATIONS } from './videoConfig';
import type { VideoGenerationProvider, VideoGenerationRequest, VideoPollResult, VideoDownloadResult } from './videoGenerationProvider';
import { GoogleGenAiVeoClient, type VeoClient, type VeoOperation } from './veoClient';

function inferImageMimeType(url: string): string {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

async function resolveImageBytes(
  imageUrl?: string | null,
): Promise<{ imageBytes: string; mimeType: string } | null> {
  if (!imageUrl) return null;
  const mimeType = inferImageMimeType(imageUrl);

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    const resp = await fetch(imageUrl);
    if (!resp.ok) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    return { imageBytes: buffer.toString('base64'), mimeType };
  }

  const key = extractStorageKey(imageUrl);
  if (key) {
    const filePath = path.join(process.cwd(), 'uploads', key);
    if (fs.existsSync(filePath)) {
      const buffer = await fs.promises.readFile(filePath);
      return { imageBytes: buffer.toString('base64'), mimeType };
    }
  }

  return null;
}

/**
 * Google Veo image-to-video provider using the official `@google/genai` SDK.
 * Implements the long-running operation lifecycle (submit → poll → download).
 */
export class GoogleVeoProvider implements VideoGenerationProvider {
  readonly name = 'VEO';
  private client: VeoClient;
  private injectedClient: boolean;
  private operations = new Map<string, VeoOperation>();

  constructor(client?: VeoClient) {
    this.injectedClient = Boolean(client);
    this.client = client ?? new GoogleGenAiVeoClient(GEMINI_API_KEY);
  }

  async submit(request: VideoGenerationRequest): Promise<{ providerJobId: string }> {
    if (!this.injectedClient && !GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not configured.');
    }

    const model = request.model || VEO_MODEL;
    const aspectRatio = VEO_SUPPORTED_ASPECT_RATIOS.includes(request.aspectRatio || '')
      ? request.aspectRatio!
      : '9:16';
    const durationSeconds =
      request.duration && VEO_SUPPORTED_DURATIONS.includes(request.duration) ? request.duration : undefined;

    const image = await resolveImageBytes(request.imageUrl);

    const operation = await this.client.generateVideos({
      model,
      prompt: request.prompt || request.promptTemplate || '',
      image,
      config: {
        aspectRatio,
        durationSeconds,
        negativePrompt: request.negativePrompt || undefined,
      },
    });

    this.operations.set(operation.name, operation);
    return { providerJobId: operation.name };
  }

  async poll(providerJobId: string): Promise<VideoPollResult> {
    const operation = this.operations.get(providerJobId);
    if (!operation) {
      return { status: 'FAILED', error: 'Provider operation not found.' };
    }

    const updated = await this.client.getVideosOperation(operation);
    this.operations.set(providerJobId, updated);

    if (updated.done) {
      if (updated.error) {
        return { status: 'FAILED', error: updated.error.message || 'Provider operation failed.' };
      }
      return { status: 'COMPLETED' };
    }

    return { status: 'PENDING' };
  }

  async download(providerJobId: string): Promise<VideoDownloadResult> {
    const operation = this.operations.get(providerJobId);
    if (!operation) {
      throw new Error('Provider operation not found.');
    }

    const result = await this.client.downloadVideo(operation);
    return {
      buffer: result.bytes,
      mimeType: result.mimeType || 'video/mp4',
      filename: `veo-${providerJobId.replace(/[^a-zA-Z0-9_-]/g, '')}.mp4`,
    };
  }
}
