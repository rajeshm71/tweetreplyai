/**
 * Quality scoring tailored for reuse-tweet reframes (not reply generation).
 */

import type { DegreeBand } from './reframe-prompts.js';
import {
  checkReframeOriginality,
  type ReframeOriginalityResult,
} from './reframe-originality-checker.js';

export interface ReframeQualityParameter {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface ReframeQualityResult {
  totalScore: number;
  originalityScore: number;
  passed: boolean;
  parameters: ReframeQualityParameter[];
  originality: ReframeOriginalityResult;
}

const TWITTER_CHAR_LIMIT = 280;
const LONG_TWEET_CHAR_LIMIT = 4000;

/** Raw parameter sum max (4 params × 10). API exposes 0–100 via normalization. */
export const REFRAME_QUALITY_RAW_MAX = 40;
/** Raw pass threshold before normalization (28/40 → 70/100). */
export const REFRAME_QUALITY_RAW_PASS = 28;

/** Maps raw 0–40 sum to 0–100 for API/history parity with reply quality scale. */
export function normalizeReframeQualityScore(rawTotal: number): number {
  return Math.round((rawTotal / REFRAME_QUALITY_RAW_MAX) * 100);
}

function contentWordOverlap(source: string, output: string): number {
  const tokenize = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3);
  const a = new Set(tokenize(source));
  const b = new Set(tokenize(output));
  if (a.size === 0) return 0;
  let common = 0;
  for (const w of Array.from(a)) {
    if (b.has(w)) common++;
  }
  return common / a.size;
}

function scoreInsightAlignment(source: string, output: string): ReframeQualityParameter {
  const overlap = contentWordOverlap(source, output);
  let score = 5;
  let reason = 'Loosely related to source insight';

  // Reframe should stay on-topic but not be a near-copy (mid overlap is ideal).
  if (overlap >= 0.15 && overlap <= 0.55) {
    score = 10;
    reason = 'Preserves source insight without reading as a copy';
  } else if (overlap >= 0.08 && overlap < 0.15) {
    score = 7;
    reason = 'Related but may have drifted from source takeaway';
  } else if (overlap > 0.55 && overlap <= 0.75) {
    score = 6;
    reason = 'High lexical overlap; may feel duplicate';
  } else if (overlap > 0.75) {
    score = 4;
    reason = 'Very high overlap with source';
  }

  return { name: 'Insight alignment', score, maxScore: 10, reason };
}

function scoreClarity(output: string): ReframeQualityParameter {
  let score = 8;
  const issues: string[] = [];
  if (/\s{2,}/.test(output)) issues.push('spacing');
  if (/[.,!?][a-zA-Z]/.test(output)) issues.push('punctuation spacing');
  if (output.length > 20 && output === output.toLowerCase()) issues.push('all lowercase');
  score = Math.max(5, 10 - issues.length * 2);
  return {
    name: 'Clarity',
    score,
    maxScore: 10,
    reason: issues.length ? `Minor clarity issues: ${issues.join(', ')}` : 'Clear and readable',
  };
}

function scoreLengthFit(output: string, allowLong: boolean): ReframeQualityParameter {
  const limit = allowLong ? LONG_TWEET_CHAR_LIMIT : TWITTER_CHAR_LIMIT;
  const len = output.length;
  let score = 10;
  let reason = `Within ${limit} character limit`;
  if (len > limit) {
    score = 3;
    reason = `Exceeds ${limit} characters (${len})`;
  } else if (len < 10) {
    score = 4;
    reason = 'Output very short';
  } else if (len > limit * 0.95) {
    score = 7;
    reason = 'Near character limit';
  }
  return { name: 'Length fit', score, maxScore: 10, reason };
}

function scoreOriginalityParam(originality: ReframeOriginalityResult): ReframeQualityParameter {
  const score = Math.round(originality.originalityScore / 10);
  return {
    name: 'Originality',
    score: Math.min(10, Math.max(1, score)),
    maxScore: 10,
    reason: originality.passed
      ? 'Surface wording sufficiently distinct from source'
      : `Originality issues: ${originality.issues.join(', ')}`,
  };
}

export function checkReframeQuality(
  source: string,
  output: string,
  band: DegreeBand,
  allowLong = false,
): ReframeQualityResult {
  const originality = checkReframeOriginality(source, output, band);
  const parameters = [
    scoreInsightAlignment(source, output),
    scoreOriginalityParam(originality),
    scoreClarity(output),
    scoreLengthFit(output, allowLong),
  ];
  const rawTotal = parameters.reduce((sum, p) => sum + p.score, 0);
  return {
    totalScore: normalizeReframeQualityScore(rawTotal),
    originalityScore: originality.originalityScore,
    passed: rawTotal >= REFRAME_QUALITY_RAW_PASS && originality.passed,
    parameters,
    originality,
  };
}
