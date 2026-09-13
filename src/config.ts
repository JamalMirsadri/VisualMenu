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

/** Returns the stored JWT, or null when unavailable (e.g. SSR / unauthenticated). */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}
