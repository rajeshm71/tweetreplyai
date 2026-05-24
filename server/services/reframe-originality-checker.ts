/**
 * Lexical originality checks for the reuse-tweet (reframe) flow.
 * Complements prompt rules with measurable overlap signals.
 */

import type { DegreeBand } from './reframe-prompts.js';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
  'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'that', 'this', 'these',
  'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
  'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'about', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'any', 'if', 'because',
  'until', 'while', 'your', 'my', 'our', 'their', 'its', 'his', 'her', 'them', 'us',
]);

export interface ReframeOriginalityResult {
  passed: boolean;
  originalityScore: number;
  issues: string[];
}

const OPENING_OVERLAP_MAX: Record<DegreeBand, number | null> = {
  minimal: null,
  light: null,
  balanced: 0.55,
  heavy: 0.45,
  reimagined: 0.35,
};

const BODY_OVERLAP_MAX: Record<DegreeBand, number | null> = {
  minimal: null,
  light: null,
  balanced: 0.65,
  heavy: 0.50,
  reimagined: 0.40,
};

function normalize(text: string): string {
  return (text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function contentWords(text: string): string[] {
  return tokenize(text).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

function getFirstLine(text: string): string {
  return (text ?? '').split(/\n/)[0]?.trim() || '';
}

/** Longest run of identical consecutive tokens shared between source and output. */
export function longestSharedWordSpan(source: string, output: string): number {
  const srcTokens = tokenize(source);
  const outTokens = tokenize(output);
  let max = 0;
  for (let i = 0; i < srcTokens.length; i++) {
    for (let j = 0; j < outTokens.length; j++) {
      let k = 0;
      while (
        i + k < srcTokens.length &&
        j + k < outTokens.length &&
        srcTokens[i + k] === outTokens[j + k]
      ) {
        k++;
      }
      if (k > max) max = k;
    }
  }
  return max;
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of Array.from(setA)) {
    if (setB.has(w)) intersection++;
  }
  const union = new Set([...Array.from(setA), ...Array.from(setB)]).size;
  return union === 0 ? 0 : intersection / union;
}

export function checkReframeOriginality(
  source: string,
  output: string,
  band: DegreeBand,
): ReframeOriginalityResult {
  const issues: string[] = [];
  const src = source ?? '';
  const out = output ?? '';

  const longestSpan = longestSharedWordSpan(src, out);
  if (longestSpan >= 8) {
    issues.push(`longest_shared_span_${longestSpan}`);
  }

  const srcOpening = getFirstLine(src);
  const outOpening = getFirstLine(out);
  if (srcOpening.length > 0 && normalize(srcOpening) === normalize(outOpening)) {
    issues.push('verbatim_opening');
  }

  const openingOverlap = jaccard(contentWords(srcOpening), contentWords(outOpening));
  const openingMax = OPENING_OVERLAP_MAX[band];
  if (openingMax !== null && openingOverlap > openingMax) {
    issues.push(`opening_overlap_${openingOverlap.toFixed(2)}`);
  }

  const bodyOverlap = jaccard(contentWords(src), contentWords(out));
  const bodyMax = BODY_OVERLAP_MAX[band];
  if (bodyMax !== null && bodyOverlap > bodyMax) {
    issues.push(`body_overlap_${bodyOverlap.toFixed(2)}`);
  }

  const spanPenalty = Math.min(longestSpan / 8, 1) * 30;
  const openPenalty = openingOverlap * 25;
  const bodyPenalty = bodyOverlap * 35;
  const verbatimPenalty = issues.includes('verbatim_opening') ? 15 : 0;
  const originalityScore = Math.max(
    0,
    Math.round(100 - spanPenalty - openPenalty - bodyPenalty - verbatimPenalty),
  );

  const hardFail =
    issues.some((i) => i.startsWith('longest_shared')) ||
    issues.includes('verbatim_opening') ||
    issues.some((i) => i.startsWith('opening_overlap')) ||
    issues.some((i) => i.startsWith('body_overlap'));

  if (band === 'minimal' || band === 'light') {
    const lightIssues = issues.filter(
      (i) => i.startsWith('longest_shared') || i === 'verbatim_opening',
    );
    return {
      passed: lightIssues.length === 0,
      originalityScore,
      issues: lightIssues,
    };
  }

  return {
    passed: !hardFail,
    originalityScore,
    issues,
  };
}
