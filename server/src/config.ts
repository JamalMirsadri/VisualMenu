/**
 * Centralized, fail-safe environment configuration.
 *
 * Phase 14 security hardening:
 * - No hardcoded JWT fallback secrets.
 * - Explicit CORS origin allowlist.
 */

/**
 * Returns the JWT signing/verification secret.
 *
 * Throws if JWT_SECRET is missing so that authentication can never silently
 * fall back to a weak, hardcoded secret. This is a fail-safe in every
 * environment (the process fails fast on first use).
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    throw new Error(
      'JWT_SECRET environment variable is not set. ' +
        'Refusing to issue or verify authentication tokens without an explicit secret.'
    );
  }
  return secret;
}

/**
 * Returns the allowlist of permitted browser origins for CORS.
 *
 * In production the origin list MUST come from `ALLOWED_ORIGINS`
 * (comma-separated). If it is missing in production, an empty list is returned
 * (fail-safe: all cross-origin requests are denied). Local development falls
 * back to the Vite dev server origins so it keeps working out of the box.
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  if (raw && raw.trim()) {
    const configured = raw
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
    if (configured.length > 0) {
      return configured;
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '[config] ALLOWED_ORIGINS is not set in production. Cross-origin requests will be denied.'
    );
    return [];
  }

  return ['http://localhost:5173', 'http://127.0.0.1:5173'];
}
