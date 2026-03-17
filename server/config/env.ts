/**
 * Centralized env access with production safety (no default secrets in prod).
 */

export const isProduction =
  process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

/**
 * Returns a response body safe to send to the client. In production, only genericMessage is returned; in development, optional error detail is included.
 */
export function getClientErrorBody(error: unknown, genericMessage: string): { message: string; error?: string } {
  if (isProduction) return { message: genericMessage };
  const safeMessage = error instanceof Error ? error.message : String(error);
  return { message: genericMessage, error: safeMessage };
}

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
