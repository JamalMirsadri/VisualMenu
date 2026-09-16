import { GoogleGenAI } from '@google/genai';

/**
 * Thin, injectable abstraction over the `@google/genai` SDK so the provider can
 * be unit-tested with a fake client and no real network/API calls.
 */
export interface VeoOperation {
  name: string;
  done: boolean;
  error?: { message?: string } | null;
  generatedVideos?: Array<{ mimeType?: string; videoBytes?: string; uri?: string }>;
  /** Opaque handle to the real SDK operation (used only by the real client). */
  _raw?: unknown;
}

export interface VeoGenerateParams {
  model: string;
  prompt: string;
  image?: { imageBytes: string; mimeType: string } | null;
  config?: {
    aspectRatio?: string;
    durationSeconds?: number;
    negativePrompt?: string;
  };
}

export interface VeoDownloadResult {
  bytes: Buffer;
  mimeType: string;
}

export interface VeoClient {
  generateVideos(params: VeoGenerateParams): Promise<VeoOperation>;
  getVideosOperation(operation: VeoOperation): Promise<VeoOperation>;
  downloadVideo(operation: VeoOperation): Promise<VeoDownloadResult>;
}

/**
 * Production client backed by the official `@google/genai` SDK.
 */
export class GoogleGenAiVeoClient implements VeoClient {
  private ai: GoogleGenAI | null = null;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get client(): GoogleGenAI {
    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey: this.apiKey });
    }
    return this.ai;
  }

  async generateVideos(params: VeoGenerateParams): Promise<VeoOperation> {
    const operation = await this.client.models.generateVideos({
      model: params.model,
      prompt: params.prompt,
      image: params.image ? { imageBytes: params.image.imageBytes, mimeType: params.image.mimeType } : undefined,
      config: {
        aspectRatio: params.config?.aspectRatio,
        durationSeconds: params.config?.durationSeconds,
        negativePrompt: params.config?.negativePrompt,
      },
    });

    return this.wrap(operation);
  }

  async getVideosOperation(operation: VeoOperation): Promise<VeoOperation> {
    if (!operation._raw) {
      throw new Error('Operation is missing its internal SDK handle.');
    }
    const raw = await this.client.operations.getVideosOperation({ operation: operation._raw as never });
    return this.wrap(raw);
  }

  async downloadVideo(operation: VeoOperation): Promise<VeoDownloadResult> {
    const video = operation.generatedVideos?.[0];
    const mimeType = video?.mimeType || 'video/mp4';

    if (video?.videoBytes) {
      return { bytes: Buffer.from(video.videoBytes, 'base64'), mimeType };
    }

    if (video?.uri) {
      const resp = await fetch(video.uri);
      if (!resp.ok) {
        throw new Error(`Failed to download generated video (HTTP ${resp.status}).`);
      }
      return { bytes: Buffer.from(await resp.arrayBuffer()), mimeType };
    }

    throw new Error('Generated video did not contain downloadable bytes or a URI.');
  }

  private wrap(op: any): VeoOperation {
    const generatedVideos = (op?.response?.generatedVideos || []).map((g: any) => ({
      mimeType: g?.video?.mimeType,
      videoBytes: g?.video?.videoBytes,
      uri: g?.video?.uri,
    }));

    return {
      name: op?.name || '',
      done: Boolean(op?.done),
      error: op?.error
        ? { message: typeof op.error.message === 'string' ? op.error.message : 'Provider operation failed.' }
        : null,
      generatedVideos,
      _raw: op,
    };
  }
}
