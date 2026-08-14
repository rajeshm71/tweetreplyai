/**
 * Quality scoring tailored for reuse-tweet reframes (not reply generation).
 */

import type { DegreeBand } from './reframe-prompts.js';
import {
  checkReframeOriginality,
  type ReframeOriginalityResult,
} from './reframe-originality-checker.js';
import {
  hasOverlongLines,
  isCollapsedTweetOutput,
} from './reframe-structure.js';

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
  structurePassed: boolean;
  parameters: ReframeQualityParameter[];
  originality: ReframeOriginalityResult;
}

const TWITTER_CHAR_LIMIT = 280;

/** Raw parameter sum max (5 params × 10). API exposes 0–100 via normalization. */
export const REFRAME_QUALITY_RAW_MAX = 50;
/** Raw pass threshold before normalization (35/50 → 70/100). */
export const REFRAME_QUALITY_RAW_PASS = 35;

/** Maps raw 0–50 sum to 0–100 for API/history parity with reply quality scale. */
export function normalizeReframeQualityScore(rawTotal: number): number {
  const normalized = Math.round((rawTotal / REFRAME_QUALITY_RAW_MAX) * 100);
  return Math.min(100, Math.max(0, normalized));
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
  const len = output.length;
  if (len < 10) {
    return { name: 'Length fit', score: 4, maxScore: 10, reason: 'Output very short' };
  }
  if (allowLong) {
    return {
      name: 'Length fit',
      score: 10,
      maxScore: 10,
      reason: 'Long tweet (no product character cap)',
    };
  }
  let score = 10;
  let reason = `Within ${TWITTER_CHAR_LIMIT} character limit`;
  if (len > TWITTER_CHAR_LIMIT) {
    score = 3;
    reason = `Exceeds ${TWITTER_CHAR_LIMIT} characters (${len})`;
  } else if (len > TWITTER_CHAR_LIMIT * 0.95) {
    score = 7;
    reason = 'Near character limit';
  }
  return { name: 'Length fit', score, maxScore: 10, reason };
}

function scoreTweetScannability(
  source: string,
  output: string,
  hasGuidance: boolean,
): ReframeQualityParameter {
  const collapsed = isCollapsedTweetOutput(source, output);
  const overlong = hasOverlongLines(output);

  if (collapsed && !hasGuidance) {
    return {
      name: 'Tweet scannability',
      score: 2,
      maxScore: 10,
      reason: 'Output collapsed into one dense paragraph; needs line breaks',
    };
  }

  let score = 10;
  const issues: string[] = [];
  if (overlong) issues.push('overlong lines');
  if (!output.includes('\n') && output.length > 80) {
    issues.push('single block');
  }
  score = Math.max(6, 10 - issues.length * 2);

  return {
    name: 'Tweet scannability',
    score,
    maxScore: 10,
    reason: issues.length
      ? `Readable but could be more scannable: ${issues.join(', ')}`
      : 'Tweet-style line breaks present',
  };
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
  hasGuidance = false,
): ReframeQualityResult {
  const originality = checkReframeOriginality(source, output, band);
  const collapsed = isCollapsedTweetOutput(source, output);
  const structurePassed = hasGuidance || !collapsed;
  const parameters = [
    scoreInsightAlignment(source, output),
    scoreOriginalityParam(originality),
    scoreTweetScannability(source, output, hasGuidance),
    scoreClarity(output),
    scoreLengthFit(output, allowLong),
  ];
  const rawTotal = parameters.reduce((sum, p) => sum + p.score, 0);
  return {
    totalScore: normalizeReframeQualityScore(rawTotal),
    originalityScore: originality.originalityScore,
    passed: rawTotal >= REFRAME_QUALITY_RAW_PASS && originality.passed && structurePassed,
    structurePassed,
    parameters,
    originality,
  };
}
