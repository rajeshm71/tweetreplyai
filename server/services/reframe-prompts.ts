/**
 * Reframe-tweet prompt templates. The public `/api/reframe-tweet` endpoint uses
 * these to build system+user prompts for the "Reuse tweet" feature in the X
 * extension. Each template is tuned for a specific band of the 0-100
 * degree-of-change slider.
 *
 * Single source of truth for degree semantics lives here. The extension only
 * mirrors labels, not rule text.
 */

export type DegreeBand = 'minimal' | 'light' | 'balanced' | 'heavy' | 'reimagined';

export interface ReframePromptConfig {
  systemPrompt: string;
  userPrompt: (source: string) => string;
  band: DegreeBand;
  degree: number;
}

export interface ReframePromptOptions {
  allowLong?: boolean;
  promptVariation?: string;
}

export function getDegreeBand(degree: number): DegreeBand {
  const d = clampDegree(degree);
  if (d <= 20) return 'minimal';
  if (d <= 40) return 'light';
  if (d <= 60) return 'balanced';
  if (d <= 80) return 'heavy';
  return 'reimagined';
}

function clampDegree(degree: number): number {
  if (!Number.isFinite(degree)) return 50;
  return Math.max(0, Math.min(100, Math.round(degree)));
}

const BAND_INSTRUCTIONS: Record<DegreeBand, string> = {
  minimal: [
    "This is a MINIMAL rewrite (copy-edit only).",
    "- Preserve the original structure, vocabulary, sentiment, and formatting.",
    "- Fix only awkward phrasing, typos, or redundancy.",
    "- Keep the same opening hook and ordering.",
    "- Anti-plagiarism floor: you MUST NOT reproduce any contiguous span of 8 or more words identical to the source. If you notice such a span, lightly reword it.",
    "- Formatting: PRESERVE the source's line-break structure exactly. If the source has blank lines between sentences or paragraphs, keep them.",
    "- Markers may change (e.g. dash vs bullet or quotes), but line breaks and inter-stanza blank lines must stay aligned with the source.",
  ].join('\n'),
  light: [
    "This is a LIGHT rewrite.",
    "- Reword roughly 30-40% of sentences; keep tone, structure, and stance unchanged.",
    "- Same hook and ordering are fine.",
    "- Anti-plagiarism floor: you MUST NOT reproduce any contiguous span of 8 or more words identical to the source.",
    "- Formatting: PRESERVE the source's line-break structure exactly. If the source has blank lines between sentences or paragraphs, keep them.",
    "- Markers may change (e.g. dash vs bullet or quotes), but line breaks and inter-stanza blank lines must stay aligned with the source.",
  ].join('\n'),
  balanced: [
    "This is a BALANCED rewrite.",
    "- Rewrite the majority of sentences in fresh language.",
    "- Preserve the core idea and stance. Reordering points or swapping the hook is allowed.",
    "- Do not copy long phrases from the source.",
    "- Formatting: mirror the source layout. If it is list-like or multiline, keep it list-like (one main idea per line or item; blank lines between stanzas if the source had them). Reword heavily; reorder items or merge adjacent redundant lines only if the output stays clearly list-like. For continuous prose sources, use short lines and breaks between ideas.",
    "- Variation: you may drop redundant items and add at most one short related line that restates or bridges the same core idea (no new facts—obey the hard rules). Wording should feel fresh so it does not read as copied.",
  ].join('\n'),
  heavy: [
    "This is a HEAVY rewrite.",
    "- Keep the thesis/insight, but use entirely new phrasing and a new hook.",
    "- List markers may change freely (dashes, bullets, quotes, questions vs statements). Add or remove lines that serve the thesis—merge near-duplicates, drop weak points, add clarifying lines—so the output feels original, not copied.",
    "- Preserve multiline break rhythm: line breaks between items, blank lines between stanzas as in the source; do not collapse list-like sources into one narrative paragraph. Continuous prose may use a hook plus short stanzas.",
    "- Formatting: short, punchy lines; keep vertical spacing aligned with the source pattern.",
  ].join('\n'),
  reimagined: [
    "This is a FULLY REIMAGINED rewrite.",
    "- Keep only the core insight or claim of the source.",
    "- Invent a new angle and voice around that insight.",
    "- Stance must be preserved (do not flip pro to con or vice versa).",
    "- Actively add, drop, or replace lines around the core insight (obey hard rules on invented specifics) so it does not read as copied. List markers may change freely.",
    "- When the source is list-like or multiline, preserve line breaks and blank-line rhythm between items or stanzas; do not merge into one prose block. Continuous prose may use a new structure with short lines and stanza breaks.",
  ].join('\n'),
};

const TWITTER_CHAR_LIMIT = 280;
const LONG_TWEET_CHAR_LIMIT = 4000;

function buildSharedRules(degree: number, allowLong: boolean): string {
  const band = getDegreeBand(degree);
  const charLimit = allowLong ? LONG_TWEET_CHAR_LIMIT : TWITTER_CHAR_LIMIT;

  const lines = [
    "Hard rules that apply to EVERY reframe:",
    "- Preserve the source language. If the source is Hindi, output Hindi; if Spanish, output Spanish; etc. Do not translate.",
    "- Output is the user's OWN standalone tweet. Do NOT attribute the idea. Do NOT include phrases like \"as @someone said\", \"quoting X\", \"via @\", or surrounding quotation marks.",
    `- Target length: the reframed tweet must fit in ${charLimit} characters.`,
    "- Do not add hashtags unless the source used them.",
    "- Do not wrap the output in quotes or code fences. No markdown syntax (no **bold**, _italic_, or #headings). Plain line breaks are allowed and encouraged.",
    "- Structural pattern: If the source is list-like or multiline, keep the same break rhythm—one main idea per line as in the source, preserve blank lines between stanzas, and do not concatenate multiple source lines into one paragraph. List markers may change (dashes, bullets, numbers, quoted lines vs plain lines). Do not collapse list-like sources into one or two narrative paragraphs. If the source is already continuous prose, short paragraphs and line breaks between ideas are fine.",
  ];

  if (band === 'minimal' || band === 'light') {
    lines.push("- Anti-plagiarism floor: never emit any contiguous span of 8 or more words identical to the source.");
  }

  if (band === 'minimal' || band === 'light' || band === 'balanced') {
    lines.push("- Do NOT invent specifics (numbers, names, dates, URLs). Only use facts that are already in the source.");
  } else {
    lines.push("- You may generalize, but do NOT invent specific numbers, names, dates, or URLs that are not in the source.");
  }

  if (band === 'minimal' || band === 'light' || band === 'balanced') {
    lines.push("- Preserve any URLs from the source verbatim. Do not invent URLs.");
  } else {
    lines.push("- URLs from the source may be dropped with a neutral mention; never invent URLs.");
  }

  lines.push(
    "- Safety: if the source promotes harassment, hate, illegal activity, or sexual content involving minors, do NOT rewrite. Return a short, neutral refusal instead.",
    "- Output ONLY the tweet text. No preamble, no explanation, no meta-commentary.",
  );

  return lines.join('\n');
}

// Tone overlays keyed by the same keys /api/prompts exposes (see
// server/services/prompts.ts PROMPT_VARIATIONS). Keep these keys in sync so
// the Reuse modal's Style dropdown actually applies a tone line when the user
// picks e.g. "humorous" or "analytical".
const PROMPT_VARIATION_TONE: Record<string, string> = {
  default: '',
  conversational: "Voice: casual and conversational, like talking to a friend on X.",
  direct:
    "Voice: blunt and direct. Cut the fluff. Short, punchy sentences—without merging list items into one paragraph when the source is list-like.",
  analytical: "Voice: measured and analytical. Prefer precise wording over flourish.",
  humorous: "Voice: light wit, one beat of humor allowed if it fits the source.",
  supportive: "Voice: warm and supportive. Never sycophantic.",
};

function buildSystemPrompt(degree: number, band: DegreeBand, allowLong: boolean, promptVariation?: string): string {
  const toneLine = promptVariation && PROMPT_VARIATION_TONE[promptVariation]
    ? PROMPT_VARIATION_TONE[promptVariation]
    : '';

  return [
    "You are a seasoned X (Twitter) user rewriting another user's tweet into YOUR OWN standalone tweet.",
    `Degree of change: ${degree}/100 (band: ${band}).`,
    '',
    BAND_INSTRUCTIONS[band],
    '',
    buildSharedRules(degree, allowLong),
    toneLine ? `\n${toneLine}` : '',
  ].filter(Boolean).join('\n');
}

export function getReframePromptConfig(
  degree: number,
  opts: ReframePromptOptions = {},
): ReframePromptConfig {
  const clamped = clampDegree(degree);
  const band = getDegreeBand(clamped);
  const allowLong = opts.allowLong === true;
  const systemPrompt = buildSystemPrompt(clamped, band, allowLong, opts.promptVariation);

  const userPrompt = (source: string) => {
    const trimmed = (source ?? '').trim();
    return [
      'Source tweet:',
      '"""',
      trimmed,
      '"""',
      '',
      `Rewrite the tweet above as your own standalone tweet at degree ${clamped}/100 (${band}).`,
      'Match the source layout: preserve line breaks and blank-line gaps; list markers may change. Add or drop related lines as needed so it does not read as copied. List-like sources stay list-like; prose stays prose-shaped. Output only the rewritten tweet text, no quotes, no preamble.',
    ].join('\n');
  };

  return { systemPrompt, userPrompt, band, degree: clamped };
}
