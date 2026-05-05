import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(__dirname, "../../..");

const scopedCopyFiles = [
  "client/src/pages/landing.tsx",
  "client/src/components/pricing-cards.tsx",
  "client/src/pages/settings.tsx",
  "client/src/components/extension-onboarding.tsx",
  "client/src/pages/privacy.tsx",
  "client/src/pages/terms.tsx",
  "extension/popup/popup.html",
  "extension/popup/popup.js",
  "extension/content/helpers/reuse-modal.js",
  "server/emailTemplates.tsx",
  "server/routes.ts",
  "server/emails/UsageThresholdEmail.tsx",
  "server/emails/ConversionEmail.tsx",
  "server/emails/PaymentReceiptEmail.tsx",
  "server/emails/NewsletterEmail.tsx",
  "server/emails/PasswordResetEmail.tsx",
  "server/emails/PaymentFailedEmail.tsx",
  "server/emails/WelcomeEmail.tsx",
  "server/emails/WinBackEmail.tsx",
  "server/emails/ActivationNudgeEmail.tsx",
];

const forbiddenPatterns: RegExp[] = [
  /[—–]/g,
  /\breal-time\b/gi,
  /\bcontext-aware\b/gi,
  /\bone-click\b/gi,
  /\bmobile-friendly\b/gi,
  /\bcopy-paste\b/gi,
  /\bon-the-go\b/gi,
  /\bauto-append\b/gi,
  /\bself-serve\b/gi,
  /\bre-enable\b/gi,
  /\bcase-by-case\b/gi,
];

function readRootFile(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/\r\n/g, "\n");
}

function extractJsStringLiterals(source: string): string[] {
  const values: string[] = [];
  // Keep literal matching single-line to avoid accidental cross-code captures.
  const literalRegex = /(["'`])([^\\\n]*(?:\\.[^\\\n]*)*)\1/g;
  for (const match of source.matchAll(literalRegex)) {
    values.push(match[2]);
  }
  return values;
}

function extractJsxTextNodes(source: string): string[] {
  const values: string[] = [];
  const jsxTextRegex = />\s*([^<>{}\n][^<>{}\n]*)\s*</g;
  for (const match of source.matchAll(jsxTextRegex)) {
    values.push(match[1].trim());
  }
  return values.filter(Boolean);
}

function extractHtmlVisibleText(source: string): string[] {
  const values: string[] = [];
  const textNodeRegex = />([^<]+)</g;
  for (const match of source.matchAll(textNodeRegex)) {
    const value = match[1].trim();
    if (value) values.push(value);
  }

  // Fix from review: include visible attributes users read in UI chrome.
  const visibleAttrRegex = /\b(?:placeholder|title|aria-label)\s*=\s*"([^"]*)"/g;
  for (const match of source.matchAll(visibleAttrRegex)) {
    const value = match[1].trim();
    if (value) values.push(value);
  }

  return values;
}

function extractCandidateVisibleStrings(relativePath: string, source: string): string[] {
  // Fix from review: avoid scanning whole files so identifiers/comments do not trigger false positives.
  if (relativePath.endsWith(".html")) {
    return extractHtmlVisibleText(source);
  }
  return [...extractJsStringLiterals(source), ...extractJsxTextNodes(source)];
}

function isLikelyUserVisibleCandidate(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.length > 220) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^\[.*\]/.test(trimmed)) return false;
  if (/data-testid|aria-|queryKey|className|route:|\/api\//i.test(trimmed)) return false;
  if (/checkout success|api-debug|guardrail|payment-email|webhook|cron/i.test(trimmed)) return false;
  return true;
}

describe("no dash visible copy guard", () => {
  it("keeps scoped visible copy free of forbidden dash forms", () => {
    for (const relativePath of scopedCopyFiles) {
      const content = readRootFile(relativePath);
      // Fix from review: check likely client-visible copy and skip telemetry/log text.
      const candidates = extractCandidateVisibleStrings(relativePath, content).filter(
        isLikelyUserVisibleCandidate,
      );
      for (const pattern of forbiddenPatterns) {
        for (const candidate of candidates) {
          expect(
            candidate,
            `${relativePath} contains forbidden pattern ${pattern} in "${candidate}"`,
          ).not.toMatch(pattern);
        }
      }
    }
  });
});
