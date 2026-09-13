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
 * Local development origins are configurable; production origins must be
 * provided explicitly via ALLOWED_ORIGINS (comma-separated).
 */
export function getAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS;
  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  if (!raw) {
    return defaults;
  }
  const configured = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return configured.length > 0 ? configured : defaults;
}
