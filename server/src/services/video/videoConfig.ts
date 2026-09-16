/**
 * AI Food Video — Veo/Google provider configuration.
 *
 * All values are read from server environment variables only. The Gemini API
 * key is NEVER exposed to the frontend, responses, logs, or the database.
 */

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

/** Default model is Veo 3.1 preview; overridable via VEO_MODEL. */
export const VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-preview';

/** Poll interval between long-running operation status checks (ms). */
export function getVeoPollIntervalMs(): number {
  return positiveInt(process.env.VEO_POLL_INTERVAL_MS, 10_000);
}

/** Total timeout for a single generation operation (ms). Default 15 minutes. */
export function getVeoTimeoutMs(): number {
  return positiveInt(process.env.VEO_TIMEOUT_MS, 15 * 60 * 1000);
}

/** Aspect ratios accepted by Veo (16:9 and 9:16). */
export const VEO_SUPPORTED_ASPECT_RATIOS = ['16:9', '9:16'];

/** Clip durations (seconds) accepted by Veo. */
export const VEO_SUPPORTED_DURATIONS = [4, 6, 8];

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
