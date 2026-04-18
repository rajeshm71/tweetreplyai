# Changelog

All notable changes to this project are documented here. Versions are tracked
against the extension manifest (currently `1.0.5`) and dashboard/server
deploys (by commit SHA on Vercel).

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Launch-readiness hardening:
  - Process-level `unhandledRejection` / `uncaughtException` handlers
    (`server/utils/crashHandlers.ts`).
  - Sentry integration on server (`@sentry/node`), dashboard (`@sentry/react`
    with `ErrorBoundary`), and extension (`@sentry/browser`).
  - PII-scrubbed Sentry contexts: only user id, no email/cookies/tokens.
  - `GET /api/health` (liveness) and `GET /api/ready` (Supabase reachability).
  - Structured JSON logger (`server/utils/logger.ts`) for production log
    drains.
  - `/admin` operator page + `GET /api/admin/ops-metrics` with DAU, signups,
    credit burn, top error codes, and subscription churn (protected by
    `ADMIN_SECRET`).
  - `extension_telemetry` Supabase table; POST events are now durable, not
    just in-memory.
  - `POST /api/account/delete` with subscription cancel + PII scrub and a
    double-confirmation UI in Settings.
  - Payment receipt email on `payment.succeeded` Dodo webhook.
  - Trial expiring reminder email (T-3 and T-1 days) via daily cron.
  - Cookie consent banner + offline indicator on the dashboard.
  - Deliverability checklist (`docs/DELIVERABILITY.md`).
  - Backup / rollback runbook (`docs/BACKUP.md`, `docs/RUNBOOK.md`).
  - End-to-end launch QA checklist (`docs/LAUNCH_QA.md`).

### Security

- `npm audit fix` applied to runtime dependencies; 0 vulnerabilities in the
  production bundle. Remaining advisories are limited to `vite` / `esbuild`
  dev-time tooling and do not ship to users.

### Changed

- `/api/billing/portal` now returns a `501 portal_unavailable` response
  instead of a broken portal; the dashboard falls back to `mailto:support@…`.
- Google OAuth routes are rate-limited via the shared `authRateLimiter`.
- Extension bundles are built via `scripts/build-extension.js`, which injects
  Sentry build-time constants cross-platform.

### Fixed

- Reused tweets now preserve line breaks and read like tweets (prompt +
  post-processor).
- Credit breakdown in the extension popup includes "Reused Tweets" (2 credits
  each).

## [1.0.5] - Extension release (current manifest)

Baseline before the launch-readiness work described above.
