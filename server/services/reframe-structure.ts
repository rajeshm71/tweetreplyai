/**
 * Structure analysis for reuse-tweet (reframe) flow.
 * Used by prompts, quality checks, and line-break formatting.
 */

const LIST_MARKER_RE = /^[-•*▪▫●○◦‣⁃]\s|^\d+[.)]\s/;

export interface TweetStructure {
  lineCount: number;
  isListLike: boolean;
  isMultiline: boolean;
  isDenseParagraph: boolean;
  hasStanzaGaps: boolean;
  charCount: number;
  sentenceCount: number;
}

export function countSentences(text: string): number {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return 0;
  const matches = trimmed.match(/[.!?]+(?:\s|$)/g);
  if (matches && matches.length > 0) return matches.length;
  return 1;
}

export function splitLines(text: string): string[] {
  return (text ?? '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function analyzeTweetStructure(text: string): TweetStructure {
  const raw = (text ?? '').trim();
  const charCount = raw.length;
  const lines = splitLines(raw);
  const lineCount = lines.length;
  const isListLike = lines.some((line) => LIST_MARKER_RE.test(line));
  const isMultiline = lineCount >= 2 || /\n/.test(raw);
  const hasStanzaGaps = /\n\s*\n/.test(raw);
  const sentenceCount = countSentences(raw);
  const isDenseParagraph = !isMultiline && (sentenceCount >= 2 || charCount > 100);

  return {
    lineCount,
    isListLike,
    isMultiline,
    isDenseParagraph,
    hasStanzaGaps,
    charCount,
    sentenceCount,
  };
}

/** True when output is a single dense block that should have been split for X readability. */
export function isCollapsedTweetOutput(source: string, output: string): boolean {
  const out = analyzeTweetStructure(output);
  const src = analyzeTweetStructure(source);

  if (out.isMultiline) return false;

  if (out.charCount <= 80 && out.sentenceCount <= 1) return false;

  if (out.charCount > 100) return true;
  if (out.sentenceCount >= 2) return true;
  if (src.isListLike || src.isMultiline || src.isDenseParagraph) return true;

  return false;
}

/** True when any output line is excessively long for tweet scanning. */
export function hasOverlongLines(output: string, maxLineChars = 140): boolean {
  const lines = splitLines(output);
  if (lines.length === 0) {
    return output.length > maxLineChars;
  }
  return lines.some((line) => line.length > maxLineChars);
}

const ONE_LINER_MAX_CHARS = 80;

/**
 * Split a dense single-block tweet into sentence-based lines for X readability.
 * Preserves existing newlines; no-op for short one-liners.
 */
export function formatReframeLineBreaks(text: string): string {
  const raw = (text ?? '').trim();
  if (!raw) return '';

  if (raw.includes('\n')) {
    return raw
      .replace(/[ \t\f\v\u00A0]+/g, ' ')
      .replace(/[ \t]*\n[ \t]*/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const structure = analyzeTweetStructure(raw);
  if (structure.charCount <= ONE_LINER_MAX_CHARS && structure.sentenceCount <= 1) {
    return raw;
  }

  const needsSplit =
    structure.sentenceCount >= 2 || structure.charCount > 100;
  if (!needsSplit) return raw;

  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [raw];
  const lines: string[] = [];

  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (!piece) continue;

    if (piece.length <= 100) {
      lines.push(piece);
      continue;
    }

    const clauses = piece.split(/,\s+/);
    let buffer = '';
    for (const clause of clauses) {
      const next = buffer ? `${buffer}, ${clause}` : clause;
      if (next.length > 100 && buffer) {
        lines.push(buffer.trim());
        buffer = clause;
      } else {
        buffer = next;
      }
    }
    if (buffer.trim()) lines.push(buffer.trim());
  }

  if (lines.length <= 1 && raw.length > 100) {
    const words = raw.split(/\s+/);
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 90 && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }

  return lines.length > 1 ? lines.join('\n') : raw;
}
