import * as Sentry from '@sentry/node';
import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

let initialized = false;

/**
 * Initialize Sentry for the Node server. Safe to call multiple times; only the
 * first call takes effect. If SENTRY_DSN is not set, this becomes a no-op so
 * dev environments stay quiet.
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA,
    // Conservative defaults. Raise later if we need more traces.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
    // Disable profiling by default; heavy for serverless and requires extra deps.
    profilesSampleRate: 0,
    // Don't send request bodies by default; they may contain user input / PII.
    sendDefaultPii: false,
    beforeSend(event) {
      // Defense-in-depth PII scrub: drop cookies and auth headers if anything
      // managed to leak through.
      if (event.request) {
        if (event.request.cookies) delete event.request.cookies;
        if (event.request.headers) {
          const h = event.request.headers as Record<string, string>;
          delete h['cookie'];
          delete h['authorization'];
          delete h['x-api-key'];
        }
      }
      return event;
    },
  });
  initialized = true;
}

/**
 * Fix (review #2): tag the current Sentry scope with the authenticated
 * request's user id. This must run AFTER auth middleware populates
 * `req.user` — not before — otherwise `req.user` is always undefined and we
 * never attach an id to events.
 *
 * The canonical call sites are inside the auth middleware functions in
 * server/routes.ts immediately after `req.user` is assigned.
 */
export function tagRequestUser(req: Request): void {
  if (!initialized) return;
  const user = (req as any).user;
  const id = user?.id;
  if (id) {
    try {
      Sentry.getCurrentScope().setUser({ id: String(id) });
    } catch {
      // Sentry not ready / failed — never let tagging break a request.
    }
  }
}

/**
 * Report a route handler error to Sentry when the handler returns 500 without
 * calling `next(err)` (so the global Express error middleware never runs).
 *
 * Skips: Zod validation errors, and errors with HTTP status in 4xx range
 * (expected client/auth/quota/rate-limit cases). Never attach request bodies
 * or tweet text — only route + optional user id tags.
 */
function toReportableRouteError(err: unknown): Error {
  if (err instanceof Error) return err;
  if (typeof err === 'string') return new Error(err.slice(0, 500));
  try {
    const s = JSON.stringify(err);
    return new Error(s.length > 500 ? `${s.slice(0, 500)}…` : s || 'Unknown error');
  } catch {
    return new Error('Unknown error');
  }
}

export function reportRouteError(
  err: unknown,
  ctx: { route: string; userId?: string; httpStatus?: number },
): void {
  if (!initialized) return;
  try {
    if (err instanceof ZodError) return;
    const fromErr = Number((err as { status?: number })?.status);
    const effectiveStatus =
      typeof ctx.httpStatus === 'number'
        ? ctx.httpStatus
        : Number.isFinite(fromErr)
          ? fromErr
          : 500;
    if (effectiveStatus >= 400 && effectiveStatus < 500) return;

    Sentry.withScope((scope) => {
      scope.setTag('route', ctx.route);
      // Plan: tag authenticated user id only (camelCase tag key for Sentry filters).
      if (ctx.userId) scope.setTag('userId', ctx.userId);
      if (ctx.httpStatus != null) scope.setTag('http_status', String(ctx.httpStatus));
      Sentry.captureException(toReportableRouteError(err));
    });
  } catch {
    /* never break request flow */
  }
}

/**
 * @deprecated Kept for backwards-compat with callers that may still import it.
 * Previously this was registered globally in server/index.ts / server/prod.ts,
 * but because it ran before per-route auth, `req.user` was always undefined.
 * Use `tagRequestUser(req)` inside the auth middleware instead.
 */
export function sentryUserContext() {
  return (req: Request, _res: Response, next: NextFunction) => {
    tagRequestUser(req);
    next();
  };
}

export { Sentry };
