# Testing Guide

This directory contains all tests for the TweetReply AI backend.

## Running Tests

| Script | Scope |
|--------|--------|
| `npm run test:unit` | `tests/unit/**` + `tests/simple.test.ts` (path-based, not title-based) |
| `npm run test:integration` | `tests/integration/**` only (uses `vitest.integration.config.ts`: serial fork, `SKIP_AUTH_RATE_LIMIT=1`, MSW `bypass` for real HTTP) |
| `npm run test:e2e` | Playwright in `e2e/` (Chromium): `chromium-public-api` + `chromium-authenticated`; starts `npm run dev` unless `E2E_BASE_URL` is set |
| `npm run test:e2e:ui` | Playwright UI mode (debug) |
| `npm run test:e2e:headed` | Playwright headed browser |
| `npm run test:all` | **Full verification:** `test:unit` → `test:integration` → `test:e2e` (stops on first failure). See [Run everything (`test:all`)](#run-everything-testall) below. |
| `npm test` | Vitest watch; default [vitest.config.ts](../vitest.config.ts) **excludes** `tests/integration/**` and `e2e/**` (use `test:integration` / `test:e2e`) |
| `npm run test:watch` | Watch mode (re-runs on file change) |
| `npm run test:coverage` | `vitest run --coverage` using default config (same excludes as `npm test` — not integration). See thresholds below. |
| `npm run test:coverage:unit` | Explicit `--exclude **/integration/**` — redundant if default config already excludes integration; kept for CI clarity. |
| `npm run test:ui` | Visual Vitest UI |

### Run everything (`test:all`)

`npm run test:all` runs, in order:

1. **`npm run test:unit`** — fast unit suite.
2. **`npm run test:integration`** — Supabase-backed tests (skip or pass depending on `DATABASE_URL` and secrets).
3. **`npm run test:e2e`** — Playwright (needs `.env` with `SUPABASE_URL` + key so `npm run dev` can start; one-time `npx playwright install chromium`).

**Prerequisites:** Same as running each command alone. **CI:** Fork PRs may lack DB/Supabase secrets; use separate jobs or optional workflows as today. **`test:all` is not** `npm test` (watch); use it when you want a full non-interactive check.

### Playwright E2E layout and environment

| Layout | Purpose |
|--------|---------|
| `e2e/public/**` | Unauthenticated UI + optional UI login (`login-flow`, `complete-profile`) |
| `e2e/api/**` | `APIRequestContext` smoke (`/api/plans`, `/api/models`, …) |
| `e2e/authenticated/**` | Tests using `storageState` from `e2e/global-setup.ts` |
| `e2e/.auth/user.json` | Written by global setup (gitignored). Empty storage when no E2E user creds. |
| `e2e/fixtures/auth.ts` | Shared `hasE2eUserCreds`, `loginViaUi`, optional no-handle user helpers |

| Variable | Required for | Notes |
|----------|----------------|-------|
| `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_ANON_KEY` | Dev server boot (`npm run dev` under Playwright) | Same as local `.env` |
| `E2E_BASE_URL` | Point tests at staging / preview | When set, Playwright does **not** start `webServer` |
| `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` | Authenticated specs + `global-setup` UI login | User must have **`xUsername` set** in `users` or setup throws |
| `E2E_USER_NO_X_EMAIL` / `E2E_USER_NO_X_PASSWORD` | Optional complete-profile flow | User **without** handle; second run may need DB reset |
| `SKIP_AUTH_RATE_LIMIT` | Stable auth in E2E | Injected as `1` for the dev child process via `playwright.config.ts` `webServer.env` |

**Fork PRs:** Authenticated tests **skip** when `E2E_USER_EMAIL` / `E2E_USER_PASSWORD` are unset (clear skip reason in HTML report). The dev server still needs Supabase env vars where CI runs E2E.

### Coverage thresholds and exclusions

Global thresholds (aggregate) in `vitest.config.ts` are **lines 60%**, **functions 60%**, **branches 40%**, **statements 60%**. Files under `coverage.exclude` do not count toward these totals, including:

- `node_modules/`, `dist/`, `tests/`, `client/`
- `**/storage-supabase.ts` (raw Supabase DB layer)
- `extension/**` (browser extension bundles)

Raising these numbers should be a deliberate effort (more unit tests and/or narrower include globs), not an arbitrary bump.

### Coverage vs unit-only

- **`npm run test:unit`** — Fast; explicit unit paths. Same core scope as default Vitest `include` minus `tests/integration/**` and `e2e/**`.
- **`npm test` / `npm run test:coverage`** — Use [vitest.config.ts](../vitest.config.ts); integration and Playwright specs are **excluded** from discovery.
- **`npm run test:integration`** — Requires a real `DATABASE_URL` (e.g. Supabase); tests skip or run accordingly.

### Integration tests (Supabase)

| Requirement | Notes |
|---------------|--------|
| **Database** | Use a **Supabase branch** or **dedicated project** — never run destructive cleanup (`cleanDatabase`) against production. |
| **Env** | `DATABASE_URL` must contain `supabase.co` (guard in `tests/helpers/db.ts`). Align `SESSION_SECRET` / JWT with `server/config/env.ts` (e.g. `.env.test`). `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` or anon key as used by `server/supabase.ts`. |
| **Conventions** | User ids / emails use `inttest-*` patterns (`tests/helpers/inttest-constants.ts`) so `cleanDatabase` removes related rows in FK-safe order. |
| **Harness** | `createIntegrationApp()` (`tests/helpers/integration-app.ts`) — `await setupRoutes`, JSON + `cookie-parser`, Dodo raw webhook body. |
| **Seeding** | `seedInttestUser` / helpers in `tests/helpers/seed.ts` so JWT `id`/`email` match `users` rows. |
| **CI** | Fork PRs often **cannot** read repo secrets — keep integration on `main` / manual workflow or optional job. Typical runtime: **1–3+ minutes** with a live DB (serial execution). |
| **Scripts** | `npm run test:integration` runs `vitest run --config vitest.integration.config.ts tests/integration`. |
| **Dodo mocks** | `getSubscription` mocks must use **future** `current_period_start` / `current_period_end` — `getActiveSubscription` filters with `current_period_end > now`. |
| **Vitest `vi.mock`** | Do not reference imported symbols inside `vi.mock(...)` factories (hoisting). Use string literals (e.g. emails) in the factory. |
| **Setup** | `tests/integration/setup.ts` loads MSW with `onUnhandledRequest: "bypass"` so supertest hits the real Express app (wired via `vitest.integration.config.ts`). |

### Next wave (integration)

Additional integration coverage (same `vitest.integration.config.ts`, `DATABASE_URL` guard where noted):

| File | What it covers |
|------|----------------|
| `feedback.integration.test.ts` | `POST /api/feedback` with JWT + seeded `reply_event`; optional 400 when `reply_event_id` missing (route requires id). |
| `billing.integration.test.ts` | Extends Dodo mocks: `POST /api/checkout` (`checkout_url`), `POST /api/billing/portal` (`portal_url`) after `storage.updateUser` sets `dodoCustomerId` (maps to `stripe_customer_id` in DB). |
| `catalog.integration.test.ts` | **No DB** — `GET /api/plans`, `/api/models`, `/api/prompts` smoke (200 + minimal shape). |
| `webhook-payment.integration.test.ts` | `payment.succeeded` mock + seeded user (`INTEG_*` `webhookPay`); asserts `stripe_customer_id` after webhook. |
| `suggest-improvements.integration.test.ts` | `POST /api/suggest-improvements` with `ai-router` / `guardrail` / `usage` mocked (`INTEG_*` `suggest`). |

No new secrets beyond existing `.env.test`; Dodo remains mocked with **literal** URLs/strings inside `vi.mock` factories.

- **`npm run test:coverage`** — Default Vitest coverage (integration excluded by [vitest.config.ts](../vitest.config.ts)). For integration coverage, run a dedicated Vitest command with `vitest.integration.config.ts` if you add one later.
- **`npm run test:coverage:unit`** — Explicit `--exclude **/integration/**`; kept for CI clarity when default config already excludes integration.

---

## Test Quality Tiers

Every unit test file is assigned a tier label that describes its coverage quality:

| Tier | Label | What it means |
|------|-------|---------------|
| **T1** | Behavioral | Tight assertions against real production logic; input→output verified |
| **T2** | Route boundary | `supertest` + `setupRoutes`, all deps mocked, HTTP contract (status + body shape) verified |
| **T3** | Smoke / import | `expect(mod).toBeDefined()` — verifies the module loads; no logic tested. Describe blocks are prefixed `[SMOKE]` |
| **T4** | Vacuous / scaffold | `expect(true).toBe(true)` — must be replaced; none remain in this repo |

---

## Unit Test File Inventory

### Route tests (T2)

| File | Tier | Coverage |
|------|------|----------|
| `tests/unit/routes/auth.test.ts` | T1/T2 | Register, login, logout, session, Google OAuth, rate-limit |
| `tests/unit/routes/auth.oauth.test.ts` | T2 | Google OAuth redirect (302) + callback failure |
| `tests/unit/routes/auth.password-reset.test.ts` | T2 | Forgot-password, reset-password (valid token, expired, weak pwd) |
| `tests/unit/routes/auth.change-password.test.ts` | T2 | 401, 400 mismatch/weak, 200 success, 500 storage error |
| `tests/unit/routes/ai.test.ts` | T2 | Generate-reply (Twitter): 200, 401, 400, 402, guardrail violation, usage increment |
| `tests/unit/routes/ai.catalog.test.ts` | T2 | GET /api/models, GET /api/prompts |
| `tests/unit/routes/ai.generate-reply.twitter.test.ts` | T2 | Twitter platform: 200, 401, 400, 402, 500, guardrail |
| `tests/unit/routes/ai.generate-reply.linkedin.test.ts` | T2 | LinkedIn platform: 200, 402, 500 |
| `tests/unit/routes/ai.suggest-improvements.test.ts` | T2 | 401, 400, 200, 402, 404, 500 |
| `tests/unit/routes/analytics.test.ts` | T2 | GET /api/analytics: 401, 200, 500 |
| `tests/unit/routes/billing.checkout.test.ts` | T2 | POST /api/checkout: 401, 400, 200, 500 |
| `tests/unit/routes/billing.portal.test.ts` | T2 | GET /api/billing/portal: 401, 404, 200, 500 |
| `tests/unit/routes/billing.subscription.test.ts` | T2 | GET /api/subscription/status, cancel: 401, 404, 200, 500 |
| `tests/unit/routes/subscription.test.ts` | T2 | GET /api/subscription: 401, 404, active/trial details |
| `tests/unit/routes/dodo.webhook.test.ts` | T2 | POST /api/webhooks/dodo: 400 bad sig, 200 payment success, 200 cancellation |
| `tests/unit/routes/feedback.test.ts` | T2 | POST /api/feedback: 401, 400 rating validation, 200 success, 500 |
| `tests/unit/routes/quality-metrics.test.ts` | T2 | GET /api/quality/metrics: 401, 200, days coercion, 500 |
| `tests/unit/routes/reply-history.test.ts` | T2 | GET /api/reply-history, POST mark-used (UUID required), DELETE, 401/500 |
| `tests/unit/routes/reply-templates.test.ts` | T2 | CRUD for /api/reply-templates: 401, 400, 200, 500 |
| `tests/unit/routes/usage.test.ts` | T2 | GET /api/usage: 401, 200 with all fields |
| `tests/unit/routes/user.preferences.test.ts` | T2 | GET/PUT /api/user/preferences: 401, 200, default-creation |
| `tests/unit/routes/user.x-username.test.ts` | T2 | GET/PUT /api/user/x-username: 401, 400, 200, 500 |

### Service / util tests (T1)

| File | Tier | Coverage |
|------|------|----------|
| `tests/unit/services/ai-router.test.ts` | T1 | generateReply (model selection, Groq→OpenAI fallback, unknown model→FALLBACK call); improveDraft; getModelInfo; estimateCost |
| `tests/unit/services/authService.test.ts` | T1 | createUser, validatePassword with env guards |
| `tests/unit/services/credits.test.ts` | T1 | CREDIT_COSTS values, getCreditCost for all modes |
| `tests/unit/services/guardrail.test.ts` | T1 | runGuardrail: pass, fail, category detection, env guards |
| `tests/unit/services/reply-postprocessor.test.ts` | T1 | processReply/processReplyLight: quotes, banned patterns, word limits, whitespace |
| `tests/unit/services/usage.test.ts` | T1 | canUseReply, consumeReply, initializeTrialForUser |
| `tests/unit/services/whitelistService.test.ts` | T1 | isWhitelisted with env guards |
| `tests/unit/utils/email.test.ts` | T1 | sendEmail with env guards (RESEND_API_KEY) |
| `tests/unit/utils/logging.test.ts` | T1 | log levels, structured output |
| `tests/unit/utils/password.test.ts` | T1 | hashPassword, verifyPassword, validatePasswordStrength, validateEmail |
| `tests/unit/config/cors.test.ts` | T1 | CORS allowed origins with env guards |
| `tests/unit/config/env.test.ts` | T1 | Required/optional env vars, getEnv, validation |
| `tests/unit/shared/constants.test.ts` | T1 | PLAN_LIMITS and PLAN_PERIODS_DAYS value assertions |

### Smoke-only tests (T3 — `[SMOKE]` prefix)

These files verify that the module loads without throwing. They do **not** test logic.
Upgrade them to T1 by mocking the API client and asserting on inputs/outputs.

| File | What to add next |
|------|-----------------|
| `tests/unit/config/constants.test.ts` | Value assertions for server config constants |
| `tests/unit/services/dodo-payments.test.ts` | `planCodeFromPriceId` mapping cases |
| `tests/unit/services/feedback-analytics.test.ts` | `computeFeedbackStats` with mock data |
| `tests/unit/services/groq.test.ts` | Mock `groq.chat.completions.create` → assert prompt shape |
| `tests/unit/services/linkedin-ai-service.test.ts` | Mock AI client → assert `generateLinkedInReply` output shape |
| `tests/unit/services/linkedin-quality-checker.test.ts` | `checkLinkedInQuality` with sample text |
| `tests/unit/services/openai.test.ts` | Mock `openai.chat.completions.create` → assert prompt shape |
| `tests/unit/services/prompt-builder.test.ts` | `buildPrompt` with tone/length/style combinations |
| `tests/unit/services/quality-checker.test.ts` | `checkQuality` with sample replies |
| `tests/unit/extension/auth-manager.test.ts` | `AuthManager.login/logout/getToken` |
| `tests/unit/extension/console-gate.test.ts` | `installConsoleGate` suppression behavior |

---

## File Structure

```
tests/
├── setup.ts                          # Global Vitest setup (env stubs, timers)
├── simple.test.ts                    # App bootstrap smoke (T3 → T2 setupRoutes)
├── README.md                         # This file
├── helpers/
│   └── request.ts                    # createTestApp(), expectJsonResponse()
├── unit/
│   ├── config/
│   │   ├── constants.test.ts         # [SMOKE] Server config constants
│   │   ├── cors.test.ts              # T1 CORS origin rules
│   │   └── env.test.ts               # T1 Env var validation
│   ├── extension/
│   │   ├── auth-manager.test.ts      # [SMOKE] Extension AuthManager
│   │   └── console-gate.test.ts      # [SMOKE] Extension console gate
│   ├── routes/
│   │   ├── ai.test.ts                # T2 generate-reply (main)
│   │   ├── ai.catalog.test.ts        # T2 models + prompts catalog
│   │   ├── ai.generate-reply.linkedin.test.ts
│   │   ├── ai.generate-reply.twitter.test.ts
│   │   ├── ai.suggest-improvements.test.ts
│   │   ├── analytics.test.ts
│   │   ├── auth.test.ts              # T1/T2 auth endpoints
│   │   ├── auth.change-password.test.ts
│   │   ├── auth.oauth.test.ts
│   │   ├── auth.password-reset.test.ts
│   │   ├── billing.checkout.test.ts
│   │   ├── billing.portal.test.ts
│   │   ├── billing.subscription.test.ts
│   │   ├── dodo.webhook.test.ts
│   │   ├── feedback.test.ts
│   │   ├── quality-metrics.test.ts
│   │   ├── reply-history.test.ts
│   │   ├── reply-templates.test.ts
│   │   ├── subscription.test.ts
│   │   ├── usage.test.ts
│   │   ├── user.preferences.test.ts
│   │   └── user.x-username.test.ts
│   ├── services/
│   │   ├── ai-router.test.ts         # T1 AI router service
│   │   ├── authService.test.ts       # T1 auth service
│   │   ├── credits.test.ts           # T1 credit costs
│   │   ├── dodo-payments.test.ts     # [SMOKE] Dodo Payments
│   │   ├── feedback-analytics.test.ts # [SMOKE] Feedback analytics
│   │   ├── groq.test.ts              # [SMOKE] Groq client
│   │   ├── guardrail.test.ts         # T1 content guardrail
│   │   ├── linkedin-ai-service.test.ts # [SMOKE] LinkedIn AI
│   │   ├── linkedin-quality-checker.test.ts # [SMOKE] LinkedIn quality
│   │   ├── openai.test.ts            # [SMOKE] OpenAI client
│   │   ├── prompt-builder.test.ts    # [SMOKE] Prompt builder
│   │   ├── quality-checker.test.ts   # [SMOKE] Quality checker
│   │   ├── reply-postprocessor.test.ts # T1 post-processor
│   │   ├── usage.test.ts             # T1 usage service
│   │   └── whitelistService.test.ts  # T1 whitelist service
│   ├── shared/
│   │   └── constants.test.ts         # T1 plan limits/periods
│   └── utils/
│       ├── email.test.ts             # T1 email utility
│       ├── logging.test.ts           # T1 logger
│       └── password.test.ts          # T1 password utils
└── integration/                      # Integration tests (require Supabase DATABASE_URL)
    └── ...
```

---

## Writing New Tests

### Route test template (T2)

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestApp } from '../../helpers/request';

vi.mock('../../../server/storage', () => ({
  storage: { getUser: vi.fn(), /* add methods used by this route */ },
}));

const authToken = 'test-token';

function app() {
  vi.resetModules();
  const { setupRoutes } = require('../../../server/routes');
  const express = require('express');
  const a = express();
  a.use(express.json());
  setupRoutes(a);
  return { raw: () => require('supertest')(a) };
}

describe('My Route - Unit Tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 401 when unauthenticated', async () => { /* ... */ });
  it('returns 400 when input is invalid', async () => { /* ... */ });
  it('returns 200 on success', async () => { /* ... */ });
  it('returns 500 when storage throws', async () => { /* ... */ });
});
```

### Service test template (T1)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: { someMethod: vi.fn() },
}));

describe('My Service - Unit Tests', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns expected value for valid input', async () => {
    const { myService } = await import('../../../server/services/my-service');
    const result = await myService.doThing('input');
    expect(result).toEqual({ success: true });
  });
});
```

### Mocking env variables

Use `vi.stubEnv` + `vi.resetModules()` for modules whose behavior depends on `process.env`:

```typescript
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('MY_API_KEY', 'test-key');
});
afterEach(() => vi.unstubAllEnvs());
```

---

## Chrome extension — manual QA (X)

These checks are **not** automated in CI (live X is fragile). Run after changing `extension/content/follow-network-interceptor.js`, `extension/content/content.js`, or manifest content scripts.

| Step | Action | Pass criteria |
|------|--------|----------------|
| Home cold | Open `https://x.com/home`, wait for the feed | With **Relationship hints** on, chips may appear for authors where the API exposes followed-by |
| Home scroll | Scroll quickly | No obvious wrong flips; debounced updates stay stable |
| Tweet detail | Open a tweet from the timeline | Hints still reasonable for OP / participants when data exists |
| Navigation | Home → profile → home | No clearly stale wrong hint for the same `@handle` |
| Hard refresh | Reload on home | Interceptor still runs early enough (MAIN `document_start`); hints repopulate |
| Toggle | Popup → Settings → **Relationship hints** off/on | Off removes chips; on restores after observer / refresh |

Build the extension before testing: `npm run build:extension` and `npm run build:extension:popup`, then reload the unpacked extension in `chrome://extensions`.

---

## Common Pitfalls

| Issue | Fix |
|-------|-----|
| Route returns 400 for a `:id` param | Zod may require a UUID — use `"00000000-0000-0000-0000-000000000001"` |
| Mock returns `undefined`, Express sends `""` | Explicitly return an object from the mock |
| Assertion on `storage.method` never fires | The method may be called inside Passport strategy logic which is bypassed by the mock |
| `days=0` returns 200 not 400 | Route uses `parseInt(days) \|\| 30`, so `0` becomes `30` |
| `validatePasswordStrength` — no special char check | The function only checks length, uppercase, lowercase, and digit |

---

## Coverage Thresholds

Configured in `vitest.config.ts` (global aggregate only; `perFile: false`):

- **Lines**: 60%+
- **Functions**: 60%+
- **Branches**: 40%+
- **Statements**: 60%+

Excluded paths (e.g. `**/storage-supabase.ts`, `extension/**`) do not contribute to these totals. See **Coverage thresholds and exclusions** under Running Tests above.
