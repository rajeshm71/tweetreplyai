#!/usr/bin/env node
/**
 * Extension bundle builder.
 *
 * Replaces the inline `esbuild ...` invocation so we can inject build-time
 * constants (Sentry DSN, release, environment) cross-platform without relying
 * on shell variable expansion.
 *
 * Usage:
 *   node scripts/build-extension.js content     # builds extension/content/content.bundle.js
 *   node scripts/build-extension.js popup       # builds extension/popup/popup.bundle.js
 *   node scripts/build-extension.js background  # builds extension/background/background.bundle.js
 *
 * Environment variables (all optional):
 *   SENTRY_DSN_EXT        Sentry DSN for the extension project
 *   SENTRY_ENVIRONMENT    Environment tag (defaults to 'production' for built artifacts)
 *   SENTRY_RELEASE        Release tag (typically the commit SHA)
 *
 * Loads repo-root `.env` so local `SENTRY_DSN_EXT` / `SENTRY_ENVIRONMENT` are
 * picked up when you run `npm run build:extension` (dotenv does not affect CI
 * if those vars are unset).
 */

import 'dotenv/config';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const target = process.argv[2];
if (!target || !['content', 'popup', 'background'].includes(target)) {
  console.error('Usage: node scripts/build-extension.js <content|popup|background>');
  process.exit(1);
}

const entry =
  target === 'content'
    ? 'extension/content/content.js'
    : target === 'popup'
      ? 'extension/popup/popup.js'
      : 'extension/background/background.js';
const outfile =
  target === 'content'
    ? 'extension/content/content.bundle.js'
    : target === 'popup'
      ? 'extension/popup/popup.bundle.js'
      : 'extension/background/background.bundle.js';

const define = {
  'process.env.SENTRY_DSN_EXT': JSON.stringify(process.env.SENTRY_DSN_EXT || ''),
  'process.env.SENTRY_ENVIRONMENT': JSON.stringify(
    process.env.SENTRY_ENVIRONMENT || 'production',
  ),
  'process.env.SENTRY_RELEASE': JSON.stringify(process.env.SENTRY_RELEASE || ''),
};

await build({
  entryPoints: [path.join(repoRoot, entry)],
  outfile: path.join(repoRoot, outfile),
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome110',
  external: ['chrome'],
  define,
  legalComments: 'none',
  logLevel: 'info',
});
