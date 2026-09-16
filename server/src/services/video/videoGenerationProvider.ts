/**
 * Reusable AI video generation provider abstraction.
 *
 * This is intentionally NOT browser automation of a Google flow and NOT a real
 * AI call. It defines the contract that official providers (Veo/Gemini/etc.)
 * will implement. The default mock provider only returns a provider job id —
 * actual generation/completion is driven by the caller (service webhook/callback).
 */

export interface VideoGenerationRequest {
  jobId: string;
  restaurantId: string;
  contentType: string;
  promptTemplate: string;
  negativePrompt?: string | null;
  imageUrl?: string | null;
  productName?: string | null;
  restaurantName?: string | null;
  logoUrl?: string | null;
  aspectRatio?: string | null;
  duration?: number | null;
  backgroundAsset?: string | null;
  styleConfig?: unknown;
  cameraConfig?: unknown;
  lightingConfig?: unknown;
  motionConfig?: unknown;
}

export interface VideoGenerationProvider {
  readonly name: string;
  submit(request: VideoGenerationRequest): Promise<{ providerJobId: string }>;
}

export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly name = 'MOCK';

  async submit(_request: VideoGenerationRequest): Promise<{ providerJobId: string }> {
    // No real generation is performed yet. Return a stable placeholder id that a
    // future provider webhook would otherwise replace with the real provider id.
    return { providerJobId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }
}

let defaultProvider: VideoGenerationProvider | null = null;

export function getVideoGenerationProvider(): VideoGenerationProvider {
  if (defaultProvider) return defaultProvider;

  const configured = (process.env.VIDEO_GENERATION_PROVIDER || 'MOCK').toUpperCase();
  switch (configured) {
    // Future official providers (e.g. VEO, GEMINI) will be registered here.
    default:
      defaultProvider = new MockVideoGenerationProvider();
      break;
  }

  return defaultProvider;
}
