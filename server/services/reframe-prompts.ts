import { analyzeTweetStructure } from './reframe-structure.js';

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
  retryBoost?: boolean;
  reuseGuidance?: string;
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
    'This is a MINIMAL rewrite (copy-edit only).',
    '- Preserve the original structure, meaning, sentiment, and formatting. When you must reword (e.g. anti-plagiarism), prefer simpler everyday words over stiff or fancy ones.',
    '- Fix only awkward phrasing, typos, or redundancy.',
    '- Keep the same opening hook and ordering.',
    '- Anti-plagiarism floor: you MUST NOT reproduce any contiguous span of 8 or more words identical to the source. If you notice such a span, lightly reword it.',
    "- Formatting: PRESERVE the source's line-break structure exactly. If the source has blank lines between sentences or paragraphs, keep them.",
    '- Markers may change (e.g. dash vs bullet or quotes), but line breaks and inter-stanza blank lines must stay aligned with the source.',
  ].join('\n'),
  light: [
    'This is a LIGHT rewrite.',
    '- Reword roughly 30-40% of sentences; keep tone, structure, and stance unchanged.',
    '- Where you reword, prefer simpler everyday language; soften stiff or jargon-heavy phrasing while keeping the same meaning.',
    '- Same hook and ordering are fine.',
    '- Anti-plagiarism floor: you MUST NOT reproduce any contiguous span of 8 or more words identical to the source.',
    "- Formatting: PRESERVE the source's line-break structure exactly. If the source has blank lines between sentences or paragraphs, keep them.",
    '- Markers may change (e.g. dash vs bullet or quotes), but line breaks and inter-stanza blank lines must stay aligned with the source.',
  ].join('\n'),
  balanced: [
    'This is a BALANCED rewrite.',
    '- Rewrite the majority of sentences in fresh language.',
    "- Preserve the core idea and stance. Keep the opening hook's intent: if the source opens with a question, the output must still open with that same question intent (light rephrase only—see hard rules); do not swap it for a statement lead or unrelated question. Reorder and vary list or body lines below freely within this band.",
    '- Do not copy long phrases from the source.',
    '- Formatting: mirror the source layout. If it is list-like or multiline, keep it list-like (one main idea per line or item; blank lines between stanzas if the source had them). Reword heavily; reorder items or merge adjacent redundant lines only if the output stays clearly list-like. For continuous prose sources, use short lines and breaks between ideas.',
    '- Variation: you may drop redundant items and add at most one short related line that restates or bridges the same core idea (no new facts—obey the hard rules). Wording should feel fresh so it does not read as copied.',
  ].join('\n'),
  heavy: [
    'This is a HEAVY rewrite.',
    '- Keep the thesis/insight. Use fresh phrasing throughout; if the source opens with a question, rephrase it but it must stay a question with the same intent (see hard rules). Originality comes from list items and body lines, not from a different prompt or a statement lead.',
    '- Do not walk the source line-by-line or stanza-by-stanza; merge, split, or reorder claims.',
    '- Keep core factual claims (real names, cited stats, dates, verifiable milestones) but express each in new sentence grammar, not the same rhetorical template with swapped words.',
    '- If a source line uses a recognizable rhetorical shape (contrast pair, repeated clause pattern, setup→punchline), do not echo that same shape in your output—choose a different way to deliver the same point (single thesis, compact list, cause→effect, grouped facts, etc.). Do not convert a declarative opening into a question hook.',
    '- You may change list markers and line order; do not map each source paragraph to one output line with the same role.',
    '- Illustrative / example details may change: round numbers, hypothetical quantities, placeholder counts, and teaching examples that are not the core factual claim may be rephrased or swapped for similar examples (same scale and role). Do not change factual numbers or invent new verifiable facts.',
    '- List markers may change freely (dashes, bullets, quotes, questions vs statements). Add or remove lines that serve the thesis—merge near-duplicates, drop weak points, add clarifying lines—so the output feels original, not copied.',
    '- Preserve multiline break rhythm: line breaks between items, blank lines between stanzas as in the source; do not collapse list-like sources into one narrative paragraph. Continuous prose may use a hook plus short stanzas.',
    '- Formatting: short, punchy lines; keep vertical spacing aligned with the source pattern.',
  ].join('\n'),
  reimagined: [
    'This is a FULLY REIMAGINED rewrite.',
    '- Keep only the core insight or claim of the source.',
    "- Invent a new angle and voice in the options, list items, and body—not by replacing a lead question with a different premise or statement hook. If the source opens with a question, preserve that question's intent in the opening (rephrase allowed; see hard rules).",
    '- Stance must be preserved (do not flip pro to con or vice versa).',
    '- Do not walk the source line-by-line or stanza-by-stanza; merge, split, or reorder claims.',
    '- Keep core factual claims (real names, cited stats, dates, verifiable milestones) but express each in new sentence grammar, not the same rhetorical template with swapped words.',
    '- If a source line uses a recognizable rhetorical shape (contrast pair, repeated clause pattern, setup→punchline), do not echo that same shape in your output—choose a different way to deliver the same point (single thesis, compact list, cause→effect, grouped facts, etc.). Do not convert a declarative opening into a question hook.',
    '- You may change tweet shape entirely (prose ↔ bullets ↔ short stanzas) as long as core facts and stance stay. Reader should not be able to follow the source line-by-line through your output.',
    '- Actively refresh illustrative examples and non-core numbers so the post reads newly written, not lightly edited.',
    '- Actively add, drop, or replace lines around the core insight (obey hard rules on invented specifics) so it does not read as copied. List markers may change freely.',
    '- When the source is list-like or multiline, preserve line breaks and blank-line rhythm between items or stanzas; do not merge into one prose block. Continuous prose may use a new structure with short lines and stanza breaks.',
  ].join('\n'),
};

const TWITTER_CHAR_LIMIT = 280;

function lengthRule(allowLong: boolean, hasGuidance: boolean): string {
  if (allowLong) {
    return '- Length: no product character cap. The tweet may exceed 280 characters (X Premium). Match source density and any author length instructions. Do not truncate to 4000 or any other ceiling.';
  }
  if (hasGuidance) {
    return `- Target length: prefer author length instructions over the default ${TWITTER_CHAR_LIMIT}-character target. If instructions are silent on length, fit in ${TWITTER_CHAR_LIMIT} characters.`;
  }
  return `- Target length: the reframed tweet must fit in ${TWITTER_CHAR_LIMIT} characters.`;
}

function formattingRules(hasGuidance: boolean): string[] {
  if (hasGuidance) {
    return [
      'Tweet output formatting (how the post should look on X):',
      '- Prefer author instructions for length and format over these defaults.',
      '- Default (only when instructions are silent): short lines with line breaks, one main idea per line.',
      '- If instructions ask for shorter, one paragraph, keep a list, or similar, follow that instead of splitting or expanding.',
      '- Do not stack multiple questions unless author instructions ask for it; if the source opens with one question, keep that single lead question only.',
      '- Very short one-liners (single sentence under ~80 characters) may stay on one line.',
    ];
  }
  return [
    'Tweet output formatting (how the post should look on X):',
    '- Output must be formatted like a real X tweet: short lines with line breaks. One main idea per line.',
    '- If the source is a continuous paragraph, split your rewrite into multiple short lines at natural sentence or clause boundaries — do not return one dense block.',
    '- One main idea per line; put a line break after each sentence or list item.',
    '- Preserve blank lines between stanzas when the source had them.',
    '- Do not collapse any source (list or paragraph) into a wall-of-text paragraph.',
    '- Do not stack multiple questions; if the source opens with one question, keep that single lead question only.',
    '- Short, scannable lines — like a real X post people scroll past.',
    '- Very short one-liners (single sentence under ~80 characters) may stay on one line.',
  ];
}

function structuralPatternRule(hasGuidance: boolean): string {
  if (hasGuidance) {
    return '- Structural pattern: follow author instructions for layout. If instructions are silent, keep list-like or multiline sources scannable (one main idea per line) and do not invent a new format.';
  }
  return '- Structural pattern: If the source is list-like or multiline, keep the same break rhythm—one main idea per line as in the source, preserve blank lines between stanzas, and do not concatenate multiple source lines into one paragraph. List markers may change (dashes, bullets, numbers, quoted lines vs plain lines). Do not collapse list-like sources into one or two narrative paragraphs. If the source is already continuous prose, short paragraphs and line breaks between ideas are fine.';
}

function buildRetryBoost(hasGuidance: boolean): string {
  const lines = [
    'RETRY — prior draft was too similar to the source.',
    'Rephrase the opening with a different structure.',
    'Replace at least two body/list lines with fresh wording.',
    'Keep the same insight and stance.',
    'Your last draft mirrored the source line-by-line. Reorder the claims.',
    "Change how each point is written—do not reuse the source's sentence shapes or clause patterns.",
    'Keep factual claims accurate; rewrite delivery. Illustrative numbers and examples may change.',
    'If the source opened with a statement, do not start the retry with a question.',
  ];
  if (hasGuidance) {
    lines.push('Keep applying author instructions; do not split into short lines if instructions asked for a paragraph or shorter block.');
  } else {
    lines.push('Prior draft was one dense paragraph. Split into short tweet lines — one idea per line, breaks after sentences or list items.');
  }
  return lines.join('\n');
}

function buildSharedRules(degree: number, allowLong: boolean, hasGuidance: boolean): string {
  const band = getDegreeBand(degree);

  const lines = [
    'Hard rules that apply to EVERY reframe:',
    '- Preserve the source language. If the source is Hindi, output Hindi; if Spanish, output Spanish; etc. Do not translate.',
    '- Plain language (when the source is English): use simple, everyday words and short, natural sentences. Avoid fancy vocabulary, academic tone, and corporate jargon unless the source depends on a specific term. If the source sounds stiff or verbose, simplify wording while preserving meaning. If the source is not English, keep that language; do not elevate style.',
    "- Output is the user's OWN standalone tweet. Do NOT attribute the idea. Do NOT include phrases like \"as @someone said\", \"quoting X\", \"via @\", or surrounding quotation marks.",
    lengthRule(allowLong, hasGuidance),
    '- Do not add hashtags unless the source used them.',
    '- Do not wrap the output in quotes or code fences. No markdown syntax (no **bold**, _italic_, or #headings). Plain line breaks are allowed and encouraged.',
    structuralPatternRule(hasGuidance),
    '- Lead question (when applicable): If the first substantive line of the source ends with ? or is clearly interrogative, the output must open with a question that preserves the same meaning and framing (who it is for, what is being asked). Light rephrase only—do not replace with a statement lead or a different question.',
    '- Declarative opening (when applicable): If the source does NOT open with a question, the output must NOT open with a question either—use a statement, claim, or headline-style opening. Do not invent a question hook for engagement. This applies at every degree, including heavy and reimagined rewrites.',
    '',
    'Anti-duplicate (all bands):',
    '- Never copy the source opening line verbatim; rephrase the hook.',
    '- Never reproduce any contiguous span of 8+ words identical to the source.',
    '- Avoid duplicate-feeling phrasing; express the same idea in fresh words.',
    '',
    ...formattingRules(hasGuidance),
  ];

  if (band === 'heavy' || band === 'reimagined') {
    lines.push(
      '',
      'Structural rewrite (heavy / reimagined only):',
      '- Same core facts and stance; different way of writing—not a synonym pass.',
      "- Do not preserve the source's sentence order or rhetorical templates.",
      '- If an output line maps 1:1 to a source line with the same grammatical shape, rewrite that line again using a different structure.',
      '- Factual claims stay accurate; illustrative numbers and example quantities may be changed or replaced with similar non-factual examples.',
      '- Do not convert a declarative source opening into a question; keep statement opens as statements.',
    );
  }

  if (band === 'minimal' || band === 'light') {
    lines.push('- Anti-plagiarism floor: never emit any contiguous span of 8 or more words identical to the source.');
  }

  if (band === 'minimal' || band === 'light' || band === 'balanced') {
    lines.push('- Do NOT invent specifics (numbers, names, dates, URLs). Only use facts that are already in the source.');
  } else {
    lines.push('- You may generalize, but do NOT invent specific numbers, names, dates, or URLs that are not in the source.');
  }

  if (band === 'minimal' || band === 'light' || band === 'balanced') {
    lines.push('- Preserve any URLs from the source verbatim. Do not invent URLs.');
  } else {
    lines.push('- URLs from the source may be dropped with a neutral mention; never invent URLs.');
  }

  lines.push(
    '- Safety: if the source promotes harassment, hate, illegal activity, or sexual content involving minors, do NOT rewrite. Return a short, neutral refusal instead.',
    '- Output ONLY the tweet text. No preamble, no explanation, no meta-commentary.',
  );

  return lines.join('\n');
}

function buildSystemPrompt(
  degree: number,
  band: DegreeBand,
  allowLong: boolean,
  retryBoost: boolean,
  hasGuidance: boolean,
): string {
  return [
    "You are an X (Twitter) user rewriting another user's tweet into YOUR OWN standalone tweet, in plain everyday language.",
    `Degree of change: ${degree}/100 (band: ${band}).`,
    '',
    BAND_INSTRUCTIONS[band],
    hasGuidance
      ? '\nAuthor instructions outrank band formatting cosmetics (line breaks, paragraph vs list, target length). Keep this band\'s rewrite intensity (how much to reword). Do not drop instruction intent to satisfy default scannability.'
      : '',
    '',
    buildSharedRules(degree, allowLong, hasGuidance),
    retryBoost ? `\n${buildRetryBoost(hasGuidance)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function defaultStructureHint(structure: ReturnType<typeof analyzeTweetStructure>): string {
  if (structure.isDenseParagraph) {
    return 'Source layout: continuous paragraph. Split your rewrite into multiple short tweet lines at sentence or clause boundaries — do not output one dense block.';
  }
  if (structure.isListLike || structure.isMultiline) {
    return `Source layout: ${structure.lineCount} lines, ${structure.isListLike ? 'list-like' : 'multiline'}. Write as a scannable X tweet with proper line breaks; markers and order may change but do not merge into one paragraph.`;
  }
  return 'Write as a scannable X tweet with proper line breaks when the content has multiple ideas.';
}

function guidanceStructureHint(structure: ReturnType<typeof analyzeTweetStructure>): string {
  if (structure.isListLike || structure.isMultiline) {
    return `Source layout: ${structure.lineCount} lines, ${structure.isListLike ? 'list-like' : 'multiline'}. Follow author instructions for format; keep list/multiline shape unless instructions say otherwise.`;
  }
  return 'Follow author instructions for length and format. Default tweet-style line breaks only if they do not conflict with those instructions.';
}

export function getReframePromptConfig(
  degree: number,
  opts: ReframePromptOptions = {},
): ReframePromptConfig {
  const clamped = clampDegree(degree);
  const band = getDegreeBand(clamped);
  const allowLong = opts.allowLong === true;
  const hasGuidance = Boolean(opts.reuseGuidance?.trim());
  const systemPrompt = buildSystemPrompt(
    clamped,
    band,
    allowLong,
    opts.retryBoost === true,
    hasGuidance,
  );

  const userPrompt = (source: string) => {
    const trimmed = (source ?? '').trim();
    const structure = analyzeTweetStructure(trimmed);
    const guidance = opts.reuseGuidance?.trim();
    const structureHint = guidance
      ? guidanceStructureHint(structure)
      : defaultStructureHint(structure);

    const baseTask = [
      'Source tweet:',
      '"""',
      trimmed,
      '"""',
    ];

    if (guidance) {
      baseTask.push(
        '',
        'Author instructions (required — apply these; they outrank default length/format/degree cosmetics):',
        '"""',
        guidance,
        '"""',
        'Non-negotiable floor (override instructions only for these): safety refusal; preserve source language; do not flip stance; do not copy 8+ contiguous words verbatim; no attribution or wrapper quotes.',
        'Mental plan only (do not output the plan; output only the tweet): (1) how each author instruction will be applied; (2) how to keep the non-negotiable floor without dropping instruction intent; (3) then write the tweet.',
      );
    }

    baseTask.push(
      '',
      `Rewrite the tweet above as your own standalone tweet at degree ${clamped}/100 (${band}).`,
      structureHint,
      guidance
        ? 'If the source opens with a question, keep that question’s intent in the opening line unless author instructions specify otherwise. If the source opens with a statement or headline, keep a statement opening unless author instructions specify otherwise. List markers may change. For English sources, use simple everyday words. Output only the rewritten tweet text, no quotes, no preamble, no plan.'
        : 'Format like a real X post: short lines, one idea per line. If the source opens with a question, keep that question’s intent in the opening line. If the source opens with a statement or headline, keep a statement opening—do not invent a question hook. List markers may change. For English sources, use simple everyday words. Output only the rewritten tweet text, no quotes, no preamble.',
    );

    if (band === 'heavy' || band === 'reimagined') {
      baseTask.push(
        "At this degree: keep core facts and stance but do not mirror the source's sentence order or rhetorical shapes—write it as your own post, not a rearranged paraphrase. Illustrative numbers and examples may change; factual claims must stay accurate.",
      );
    }

    return baseTask.join('\n');
  };

  return { systemPrompt, userPrompt, band, degree: clamped };
}
