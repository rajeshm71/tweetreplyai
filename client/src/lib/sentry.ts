import * as Sentry from "@sentry/react";

let initialized = false;

/**
 * Initialize Sentry for the dashboard (Vite + React). No-op when
 * VITE_SENTRY_DSN is not set so local dev stays quiet.
 */
export function initClientSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined) || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Scrub obvious PII from the URL/query string.
      if (event.request?.url) {
        try {
          const u = new URL(event.request.url);
          ["email", "token", "password", "access_token"].forEach((k) => u.searchParams.delete(k));
          event.request.url = u.toString();
        } catch {
          // ignore URL parse failures
        }
      }
      return event;
    },
  });
  initialized = true;
}

/**
 * Tag the Sentry scope with the authenticated user's id. Never include email
 * or name to keep error events free of PII.
 */
export function setSentryUser(userId: string | null | undefined): void {
  if (!initialized) return;
  if (userId) {
    Sentry.setUser({ id: String(userId) });
  } else {
    Sentry.setUser(null);
  }
}

export { Sentry };
