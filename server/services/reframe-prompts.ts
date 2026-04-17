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
  ].join('\n'),
  light: [
    "This is a LIGHT rewrite.",
    "- Reword roughly 30-40% of sentences; keep tone, structure, and stance unchanged.",
    "- Same hook and ordering are fine.",
    "- Anti-plagiarism floor: you MUST NOT reproduce any contiguous span of 8 or more words identical to the source.",
    "- Formatting: PRESERVE the source's line-break structure exactly. If the source has blank lines between sentences or paragraphs, keep them.",
  ].join('\n'),
  balanced: [
    "This is a BALANCED rewrite.",
    "- Rewrite the majority of sentences in fresh language.",
    "- Preserve the core idea and stance. Reordering points or swapping the hook is allowed.",
    "- Do not copy long phrases from the source.",
    "- Formatting: write like a tweet. Break the output into short lines, with a blank line between distinct ideas. 1-3 short paragraphs is typical.",
  ].join('\n'),
  heavy: [
    "This is a HEAVY rewrite.",
    "- Keep the thesis/insight, but use entirely new phrasing and a new hook.",
    "- Format can change (prose vs. short list, question vs. statement).",
    "- Do not preserve the exact structure of the source.",
    "- Formatting: write like a tweet. Favor short, punchy lines. Use a blank line between distinct ideas. A one-line hook + 1-2 short paragraphs reads well.",
  ].join('\n'),
  reimagined: [
    "This is a FULLY REIMAGINED rewrite.",
    "- Keep only the core insight or claim of the source.",
    "- Invent a new angle, voice, and structure around that insight.",
    "- Stance must be preserved (do not flip pro to con or vice versa).",
    "- Formatting: write like a tweet. Favor short, punchy lines. Use a blank line between distinct ideas. A one-line hook + 1-2 short paragraphs reads well.",
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
  direct: "Voice: blunt and direct. Cut the fluff. Short, punchy sentences.",
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
      'Use line breaks where they read naturally for a tweet. Output only the rewritten tweet text, no quotes, no preamble.',
    ].join('\n');
  };

  return { systemPrompt, userPrompt, band, degree: clamped };
}
