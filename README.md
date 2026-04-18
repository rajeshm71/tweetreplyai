# TweetReplyAI

AI-powered reply assistant for X (Twitter). A Chrome extension injects a
"Suggest" button into the composer that calls the backend to generate
human-sounding replies using OpenAI / Groq. The web dashboard (Vite + React)
handles signup, billing, usage, and settings; the API is an Express server
deployed on Vercel with Supabase as the primary datastore.

## Stack

- **Dashboard**: Vite + React 18 + Tailwind + TanStack Query (`client/`)
- **API**: Express on Vercel serverless functions (`server/`)
- **Datastore**: Supabase (Postgres + RLS) via `@supabase/supabase-js`
- **AI**: OpenAI + Groq, routed through `server/services/ai-router.ts`
- **Billing**: Dodo Payments (subscriptions + webhooks)
- **Email**: Resend (transactional) + React Email templates
- **Error monitoring**: Sentry (server, dashboard, extension)
- **Extension**: Manifest v3, content + popup scripts bundled with esbuild
  (`extension/`)

## Quick start (local)

Requirements: Node 20+, npm 10+.

```bash
# 1. Install
npm install

# 2. Copy env and fill in values (see .env.example)
cp .env.example .env

# 3. Dev server (Vite + Express on :5000)
npm run dev
```

Then load the unpacked extension from `extension/` in Chrome. Set
`EXTENSION_API_URL=http://localhost:5000` in your `.env` for local testing.

## Scripts

| script | purpose |
| --- | --- |
| `npm run dev` | Run API + Vite dev together on `:5000` |
| `npm run build` | Build dashboard assets + server bundle for Vercel |
| `npm run start` | Start production server from `dist/` |
| `npm run check` | `tsc --noEmit` typecheck |
| `npm run test` | Vitest watch mode |
| `npm run test:unit` | Run unit suites once |
| `npm run test:integration` | Run integration suites once |
| `npm run test:e2e` | Run Playwright E2E suites |
| `npm run build:extension` | Bundle extension content + popup |
| `npm run package:extension` | Verify + bundle + zip extension for the store |

## Environment

See [`.env.example`](./.env.example) for the full list. Required at runtime in
production: `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`OPENAI_API_KEY`, `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`,
`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_SECRET`.

Optional but recommended: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_DSN_EXT`.

## Ops

- **Health**: `GET /api/health` (liveness), `GET /api/ready` (readiness +
  Supabase reachability). Register both with your uptime monitor.
- **Admin dashboard**: `/admin` on the dashboard, protected by `ADMIN_SECRET`.
  See DAU, signups, credit burn, and top extension error codes.
- **Telemetry**: Extension events are persisted to Supabase
  `extension_telemetry`. See [`docs/RUNBOOK.md`](./docs/RUNBOOK.md) for queries.
- **Deliverability**: See [`docs/DELIVERABILITY.md`](./docs/DELIVERABILITY.md)
  for SPF/DKIM/DMARC setup.

## Repository layout

```
client/               React dashboard
extension/            Published X/Twitter extension
extension-linkedin/   LinkedIn extension (separate build)
server/               Express API + services
  emails/             React Email templates
  services/           Business logic (usage, billing, AI, email, guardrail…)
  utils/              Sentry, logger, crash handlers, etc.
shared/               Types + constants shared between client/server/extension
tests/                Vitest unit + integration + Playwright E2E
docs/                 Runbooks, backup plans, deliverability notes
```

## License

Proprietary. © TweetReplyAI.
