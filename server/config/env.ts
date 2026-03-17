/**
 * Centralized env access with production safety (no default secrets in prod).
 */

const isProduction =
  process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

/**
 * Returns the session secret. In production, throws if SESSION_SECRET is not set.
 * In development, falls back to 'dev-secret' when unset.
 */
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (isProduction && !secret) {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  return secret || 'dev-secret';
}
