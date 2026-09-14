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

/**
 * Returns the public base URL under which uploaded media (`/uploads`) is served.
 *
 * Empty when unset (local/dev: media URLs stay origin-relative and are proxied
 * by the Vite dev server). In production this MUST be set to the backend's
 * public origin, e.g. `https://visualmenu.outlethubs.com`.
 */
export function getPublicBaseUrl(): string {
  const base = process.env.PUBLIC_BASE_URL;
  if (!base || !base.trim()) return '';
  return base.trim().replace(/\/+$/, '');
}

/**
 * Builds the public URL for a stored media key.
 *
 * The storage key (`restaurants/<id>/<file>`) is kept separate from the public
 * URL. When PUBLIC_BASE_URL is configured the result is an absolute URL
 * (`<base>/uploads/<key>`); otherwise it is the legacy relative `/uploads/<key>`.
 */
export function buildPublicMediaUrl(key: string): string {
  const safeKey = String(key || '').replace(/^\/+/, '');
  const base = getPublicBaseUrl();
  return base ? `${base}/uploads/${safeKey}` : `/uploads/${safeKey}`;
}

/**
 * Extracts the storage key from a media URL, or returns null for non-local URLs.
 * Handles both legacy relative (`/uploads/...`) and absolute
 * (`https://host/uploads/...`) forms.
 */
export function extractStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const marker = '/uploads/';
  const idx = trimmed.indexOf(marker);
  if (idx === -1) return null;
  const key = trimmed.slice(idx + marker.length);
  return key || null;
}

/**
 * True when a media URL refers to a locally-stored upload (vs an external URL).
 */
export function isLocalMediaUrl(url: string | null | undefined): boolean {
  return extractStorageKey(url) !== null;
}
