/**
 * Reusable AI video generation provider abstraction.
 *
 * The default mock provider only returns a provider job id and never completes,
 * so development/tests remain hermetic. The Google Veo provider (registered
 * via `VIDEO_GENERATION_PROVIDER=VEO`) implements the full async lifecycle
 * through the optional `poll` / `download` methods.
 */
import { GoogleVeoProvider } from './googleVeoProvider';

export interface VideoGenerationRequest {
  jobId: string;
  restaurantId: string;
  contentType: string;
  /** Raw prompt template (with {VARIABLE} placeholders). */
  promptTemplate: string;
  /** Final resolved prompt (server-side variable substitution). */
  prompt?: string;
  negativePrompt?: string | null;
  imageUrl?: string | null;
  imageMimeType?: string | null;
  productName?: string | null;
  restaurantName?: string | null;
  logoUrl?: string | null;
  model?: string | null;
  aspectRatio?: string | null;
  duration?: number | null;
  backgroundAsset?: string | null;
  styleConfig?: unknown;
  cameraConfig?: unknown;
  lightingConfig?: unknown;
  motionConfig?: unknown;
}

export interface VideoPollResult {
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  error?: string;
}

export interface VideoDownloadResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface VideoGenerationProvider {
  readonly name: string;
  submit(request: VideoGenerationRequest): Promise<{ providerJobId: string }>;
  /** Optional long-running operation support (real async providers). */
  poll?(providerJobId: string): Promise<VideoPollResult>;
  download?(providerJobId: string): Promise<VideoDownloadResult>;
}

export class MockVideoGenerationProvider implements VideoGenerationProvider {
  readonly name = 'MOCK';

  async submit(_request: VideoGenerationRequest): Promise<{ providerJobId: string }> {
    // No real generation is performed. Jobs stay PROCESSING for manual testing.
    return { providerJobId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` };
  }
}

let defaultProvider: VideoGenerationProvider | null = null;

export function getVideoGenerationProvider(): VideoGenerationProvider {
  if (defaultProvider) return defaultProvider;

  const configured = (process.env.VIDEO_GENERATION_PROVIDER || 'MOCK').toUpperCase();
  switch (configured) {
    case 'VEO':
    case 'GEMINI':
      defaultProvider = new GoogleVeoProvider();
      break;
    default:
      defaultProvider = new MockVideoGenerationProvider();
      break;
  }

  return defaultProvider;
}

/** Test-only injection point for a fake provider. */
export function setVideoGenerationProvider(provider: VideoGenerationProvider): void {
  defaultProvider = provider;
}

/** Test-only reset so the factory can re-resolve from configuration. */
export function resetVideoGenerationProvider(): void {
  defaultProvider = null;
}
