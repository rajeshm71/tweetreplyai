/**
 * Sentry wrapper for extension content, popup, and background bundles.
 *
 * This file is imported by extension/content/content.js,
 * extension/popup/popup.js, and extension/background/background.js (bundled).
 * At build time
 * `scripts/build-extension.js` substitutes the literal property accesses
 * `process.env.SENTRY_DSN_EXT`, `process.env.SENTRY_ENVIRONMENT`, and
 * `process.env.SENTRY_RELEASE` via esbuild's `define` option.
 *
 * IMPORTANT: Do NOT wrap those accesses in `typeof process !== 'undefined'`
 * guards — `process` itself is NOT defined in a browser bundle, so the guard
 * short-circuits to `false` and the define never takes effect. With bare
 * references, esbuild replaces each occurrence with a string literal at build
 * time and the surrounding expression disappears.
 *
 * When SENTRY_DSN_EXT is not provided at build time, the DSN is the empty
 * string and `Sentry.init` is skipped.
 *
 * PII policy for the extension:
 *   - Never send tweet text, usernames, or emails.
 *   - Only send the authenticated user id when available.
 *   - Strip query strings from URLs defensively.
 */

import * as Sentry from '@sentry/browser';

// Fix (review #1a): bare property accesses so esbuild `define` can inline
// the build-time DSN/env/release. Wrapping them in `typeof process` guards
// produces `false && "<value>" || ''` in the browser bundle where `process`
// is undefined, which defeats the whole injection.
const DSN = process.env.SENTRY_DSN_EXT || '';
const ENV = process.env.SENTRY_ENVIRONMENT || 'production';
const RELEASE = process.env.SENTRY_RELEASE || undefined;

let initialized = false;

function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

export function initExtensionSentry({ scope } = {}) {
  if (initialized) return;
  if (!DSN) return;

  try {
    Sentry.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      // Fix (review #1b): @sentry/browser auto-disables inside browser
      // extensions unless this flag is set. Without it, every event is
      // silently dropped regardless of DSN.
      skipBrowserExtensionCheck: true,
      tracesSampleRate: 0,
      sendDefaultPii: false,
      initialScope: scope ? { tags: { scope } } : undefined,
      beforeSend(event) {
        if (event.request?.url) event.request.url = scrubUrl(event.request.url);
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers) {
          delete event.request.headers.cookie;
          delete event.request.headers.authorization;
        }
        // Drop any message payload that looks like tweet/reply text
        // (>280 chars or contains newlines) to avoid leaking content.
        if (event.extra) {
          for (const k of Object.keys(event.extra)) {
            const v = event.extra[k];
            if (typeof v === 'string' && (v.length > 280 || v.includes('\n'))) {
              event.extra[k] = '[redacted]';
            }
          }
        }
        return event;
      },
    });
    initialized = true;
  } catch {
    // Swallow init failures; we never want Sentry to break the extension.
  }
}

export function setExtensionUser(userId) {
  if (!initialized) return;
  try {
    if (userId) Sentry.setUser({ id: String(userId) });
    else Sentry.setUser(null);
  } catch {
    // ignore
  }
}

export function captureExtensionError(err, context) {
  if (!initialized) return;
  try {
    if (!context) {
      Sentry.captureException(err);
      return;
    }
    const structured =
      Object.prototype.hasOwnProperty.call(context, 'tags') ||
      Object.prototype.hasOwnProperty.call(context, 'extra') ||
      Object.prototype.hasOwnProperty.call(context, 'fingerprint');
    if (structured) {
      const { tags, extra, fingerprint, level, contexts } = context;
      // Only plain objects — arrays / primitives would confuse Sentry's capture context shape.
      const safeTags =
        tags && typeof tags === 'object' && !Array.isArray(tags) ? tags : undefined;
      const safeExtra =
        extra && typeof extra === 'object' && !Array.isArray(extra) ? extra : undefined;
      const safeFingerprint = Array.isArray(fingerprint)
        ? fingerprint.map((x) => String(x))
        : undefined;
      Sentry.captureException(err, {
        tags: safeTags,
        extra: safeExtra,
        fingerprint: safeFingerprint,
        level,
        contexts,
      });
      return;
    }
    Sentry.captureException(err, { extra: context });
  } catch {
    // ignore
  }
}

export { Sentry };
