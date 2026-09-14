/**
 * Centralized frontend API configuration.
 *
 * Single source of truth for the API base URL and the authentication token,
 * so no page/service hardcodes origins or token keys (avoids CORS "origin not
 * allowed" drift between dev and production).
 */

/**
 * Base URL for all REST + SSE requests. In development this defaults to the
 * Vite proxy (`/api`). In production set `VITE_API_URL` to the full backend
 * base path, e.g. `https://api.example.com/api` (must include the `/api` prefix).
 */
export const API_BASE_URL: string = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

/** Canonical localStorage key for the JWT. */
export const AUTH_TOKEN_KEY = 'aura_admin_token';

/** Builds an absolute API URL from a path (leading slash optional). */
export function buildApiUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Extracts the origin (scheme + host) from an absolute URL, or '' otherwise. */
function deriveOrigin(url: string): string {
  const match = url.match(/^(https?:\/\/[^/]+)/);
  return match ? match[1] : '';
}

/**
 * Base origin where uploaded media (`/uploads`) is served. Prefer an explicit
 * `VITE_MEDIA_BASE_URL`; otherwise derive it from the API origin (same backend
 * serves `/api` and `/uploads`). Empty in same-origin dev (relative `/uploads`
 * is handled by the Vite proxy).
 */
export const MEDIA_BASE_URL: string = (
  import.meta.env.VITE_MEDIA_BASE_URL || deriveOrigin(API_BASE_URL)
).replace(/\/+$/, '');

/**
 * Resolves a media URL for direct use in `<img>` / `<video>` `src`.
 *
 * - Absolute URLs (http/https, protocol-relative, data:, blob:) are returned unchanged.
 * - Legacy relative `/uploads/...` URLs are resolved against MEDIA_BASE_URL when known.
 * - Other relative paths are returned unchanged.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  if (trimmed.startsWith('/uploads/')) {
    return MEDIA_BASE_URL ? `${MEDIA_BASE_URL}${trimmed}` : trimmed;
  }
  return trimmed;
}

/** Returns the stored JWT, or null when unavailable (e.g. SSR / unauthenticated). */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}
