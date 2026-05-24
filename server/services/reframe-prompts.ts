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
}

const INSIGHT_SHARPENING = [
  'Insight first:',
  "- Before rewriting, identify the source's core insight in one plain sentence (mental step only—do not output it).",
  '- The output must deliver that same insight and stance; change how it is expressed, not what it claims.',
  '- Surface text (hook, list lines, examples) should feel newly written; the insight should feel clearer, not diluted.',
  '',
  'Sharpening by band:',
  '- minimal / light: clarify wording only; do not add or remove ideas.',
  '- balanced: remove obvious filler; make the takeaway easier to grasp; reorder list items if helpful.',
  '- heavy / reimagined: repackage the insight with a fresh hook and new supporting lines; drop weak/redundant lines; swap illustrative examples.',
].join('\n');

const DEFAULT_VOICE = [
  'Default voice (always on):',
  '- Write like a real person posting on X: clear, natural, unforced.',
  '- Simple everyday words; short sentences unless the source is dense.',
  '- Match source energy; do not hype flat tweets or flatten excited ones.',
  '- Your own tweet—not a summary, quote, or reply.',
  '- Concrete over vague; no motivational clichés or thread-bait ("Here\'s why…").',
  '- No new hashtags, @mentions, or links unless the source had them.',
  '- Voice applies within the degree band: low degrees = word choice; high degrees = hook and list lines too.',
].join('\n');

const RETRY_BOOST = [
  'RETRY — prior draft was too similar to the source.',
  'Increase surface novelty while keeping the same core insight and stance.',
  'Rewrite the opening line with a completely different structure.',
  'Replace at least two body/list lines with fresh phrasing.',
].join('\n');

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
    'MINIMAL rewrite (copy-edit):',
    '- Preserve structure, meaning, sentiment, and line breaks.',
    '- Fix awkward phrasing, typos, and redundancy only.',
    '- Keep the same opening hook intent but rephrase hook words (never verbatim opening).',
    '- When rewording, swap stiff or fancy words for plain ones.',
    '- Anti-plagiarism: no contiguous span of 8+ words identical to the source.',
    '- Markers may change (dash vs bullet); blank lines between stanzas must stay.',
    '- Preserve ALL numbers exactly (factual and illustrative).',
  ].join('\n'),
  light: [
    'LIGHT rewrite:',
    '- Reword roughly 30–40% of sentences; tone and stance unchanged.',
    '- Rephrase the hook; same hook intent and ordering; simplify jargon where possible.',
    '- Anti-plagiarism: no contiguous span of 8+ words identical to the source.',
    '- Preserve line-break rhythm and blank lines between stanzas.',
    '- Preserve ALL numbers exactly (factual and illustrative).',
  ].join('\n'),
  balanced: [
    'BALANCED rewrite:',
    '- Rewrite most sentences in fresh language; keep the core idea and stance.',
    '- Sharpen the takeaway: remove filler; make the implicit point explicit (no new facts).',
    '- If the source opens with a question, the output must still open with that same question intent (light rephrase only).',
    '- Do not copy long phrases from the source.',
    '- List-like sources stay list-like; you may reorder items, drop one redundant line, or add at most one short bridging line (no new facts).',
    '- Mirror blank-line gaps; do not merge list items into one paragraph.',
    '- Preserve factual numbers exactly; keep illustrative numbers unless a natural rephrase requires a minor swap.',
    '- Opening must not be verbatim; share at most ~40% of content words with the source opening.',
  ].join('\n'),
  heavy: [
    'HEAVY rewrite:',
    '- Keep the thesis; use fresh phrasing throughout.',
    '- Lead question (if any) stays a question with the same intent.',
    '- You may add, remove, or merge list lines that serve the thesis; markers may change freely.',
    '- Preserve vertical rhythm: one main idea per line; do not collapse lists into prose blocks.',
    '- Wording should feel original, not lightly edited.',
    '- At least half of list/body lines should use substantially new phrasing (not synonym swaps only).',
    '- Illustrative numbers: you MAY replace example/hypothetical numbers with different but similar ones (same scale and role). Do NOT change factual numbers.',
  ].join('\n'),
  reimagined: [
    'FULLY REIMAGINED rewrite:',
    '- Keep only the core insight or claim; preserve stance (do not flip pro/con).',
    '- Invent a new angle in hooks, options, and body lines—not by replacing a lead question with a different premise.',
    '- Actively add, drop, or replace lines so it does not read as copied.',
    '- List-like sources keep line breaks and stanza gaps; continuous prose may use a new structure with short stanzas.',
    '- Illustrative numbers: actively swap example/hypothetical numbers for fresh similar ones (counts stay counts, money stays money).',
    '- Factual numbers: preserve verbatim, or generalize/drop the whole claim line—never substitute a different factual figure.',
    '- Do not invent new proper names, dates, URLs, or verifiable statistics that were not in the source.',
  ].join('\n'),
};

const TWITTER_CHAR_LIMIT = 280;
const LONG_TWEET_CHAR_LIMIT = 4000;

export function buildOriginalityRules(band: DegreeBand): string {
  const lines = [
    'Originality (avoid looking duplicate):',
    '',
    'All bands:',
    '- No contiguous span of 8+ words identical to the source.',
    "- Do not reuse the source's opening line verbatim (even if under 8 words)—always rephrase the hook.",
    '- Avoid copying distinctive phrases, coined terms, or memorable punchlines from the source; express the same idea with different words.',
  ];

  if (band === 'balanced') {
    lines.push(
      '',
      'balanced:',
      '- Opening line: share at most ~40% of content words with the source opening (rephrase structure, not just synonyms).',
      '- Reorder at least one list item or merge two redundant items when list-like.',
    );
  } else if (band === 'heavy') {
    lines.push(
      '',
      'heavy:',
      '- Opening line: fresh structure required; same intent only.',
      '- At least half of list/body lines should use substantially new phrasing (not synonym swaps only).',
      '- Change list markers and line order where it still reads naturally.',
    );
  } else if (band === 'reimagined') {
    lines.push(
      '',
      'reimagined:',
      '- Treat the source as inspiration: new packaging, same insight.',
      '- No line should read like a light edit; if a line is too close, rewrite or drop it.',
      '- Illustrative examples and numbers should change when present (see number rules).',
    );
  }

  return lines.join('\n');
}

export function buildNumberRules(band: DegreeBand): string {
  const lines = [
    'Numbers — distinguish examples from facts:',
    '',
    'FACTUAL numbers (preserve unless you drop/generalize the whole line):',
    '- Dates and years (launch dates, deadlines, "in 2024")',
    '- Cited or precise statistics ("37% of…", "ARR hit $1.2M")',
    '- Official prices, version numbers, SKUs, scores, rankings tied to a real event/product',
    '- Counts that are the core claim ("we shipped 500 units", "Day 47 of…")',
    '',
    'ILLUSTRATIVE / EXAMPLE numbers (may vary by degree):',
    '- Round or hypothetical quantities ("imagine 10 clients", "charge $50/hour", "3 simple steps")',
    '- Placeholder list counts where the number is not the insight ("5 tips" → similar count OK at high bands)',
    '- Made-up scenarios clearly used to teach a pattern, not report an outcome',
    '',
    'Band behavior:',
  ];

  switch (band) {
    case 'minimal':
    case 'light':
      lines.push('- minimal / light: preserve ALL numbers exactly (facts and examples).');
      break;
    case 'balanced':
      lines.push(
        '- balanced: preserve factual numbers exactly; keep illustrative numbers unless rewording forces a natural swap.',
      );
      break;
    case 'heavy':
      lines.push(
        '- heavy: preserve factual numbers; MAY swap illustrative numbers for similar ones (same unit and magnitude order).',
      );
      break;
    case 'reimagined':
      lines.push(
        '- reimagined: preserve factual numbers OR generalize/drop that line; SHOULD swap illustrative numbers for fresh similar examples.',
      );
      break;
  }

  return lines.join('\n');
}

function buildSharedRules(degree: number, allowLong: boolean): string {
  const band = getDegreeBand(degree);
  const charLimit = allowLong ? LONG_TWEET_CHAR_LIMIT : TWITTER_CHAR_LIMIT;

  const lines = [
    'Hard rules that apply to EVERY reframe:',
    '- Preserve the source language. If the source is Hindi, output Hindi; if Spanish, output Spanish; etc. Do not translate.',
    '- Plain language (when the source is English): use simple, everyday words and short, natural sentences. Avoid fancy vocabulary, academic tone, and corporate jargon unless the source depends on a specific term.',
    '- Output is the user\'s OWN standalone tweet. Do NOT attribute the idea. Do NOT include phrases like "as @someone said", "quoting X", "via @", or surrounding quotation marks.',
    `- Target length: the reframed tweet must fit in ${charLimit} characters.`,
    '- Do not add hashtags unless the source used them.',
    '- Do not wrap the output in quotes or code fences. No markdown syntax (no **bold**, _italic_, or #headings). Plain line breaks are allowed and encouraged.',
    '- Structural pattern: If the source is list-like or multiline, keep the same break rhythm—one main idea per line as in the source, preserve blank lines between stanzas, and do not concatenate multiple source lines into one paragraph. List markers may change. Do not collapse list-like sources into one or two narrative paragraphs.',
    '- Lead question (when applicable): If the first substantive line of the source ends with ? or is clearly interrogative, the output must open with a question that preserves the same meaning and framing. Light rephrase only—do not replace with a statement lead or a different question. Do not invent a question for purely declarative opens.',
    '',
    buildNumberRules(band),
    '',
    '- Names and dates: preserve proper names and calendar dates at minimal/light/balanced; at heavy/reimagined you may generalize ("a founder") but do not swap one real person/date for another invented one.',
  ];

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
  retryBoost?: boolean,
): string {
  return [
    'You are an X (Twitter) user rewriting another user\'s tweet into YOUR OWN standalone tweet, in plain everyday language.',
    `Degree of change: ${degree}/100 (band: ${band}).`,
    '',
    INSIGHT_SHARPENING,
    '',
    BAND_INSTRUCTIONS[band],
    '',
    buildOriginalityRules(band),
    '',
    buildSharedRules(degree, allowLong),
    '',
    DEFAULT_VOICE,
    retryBoost ? `\n${RETRY_BOOST}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function buildUserPrompt(source: string, degree: number, band: DegreeBand): string {
  const trimmed = (source ?? '').trim();
  return [
    'Source tweet:',
    '"""',
    trimmed,
    '"""',
    '',
    'Task: Rewrite as YOUR OWN standalone X post.',
    '',
    `Degree: ${degree}/100 (${band} band).`,
    '',
    'Before you write (mental only):',
    'A) Core insight: what single claim or takeaway is this tweet making?',
    'B) Tweet shape: list, question-led, one-liner, or short prose?',
    'C) Filler: which lines don\'t add insight and could go at this degree?',
    '',
    'Checklist:',
    '1. Deliver the same insight and stance as (A)—clearer if possible, never a different idea.',
    '2. Match layout rhythm from (B); list-like stays list-like.',
    '3. Opening line: rephrase—never copy verbatim; keep question intent if question-led.',
    `4. Obey ${band} rewrite + originality rules; avoid duplicate-feeling phrasing.`,
    '5. Numbers: factual = keep; illustrative = may swap at heavy/reimagined.',
    '6. Output only the tweet text.',
  ].join('\n');
}

export function getReframePromptConfig(
  degree: number,
  opts: ReframePromptOptions = {},
): ReframePromptConfig {
  const clamped = clampDegree(degree);
  const band = getDegreeBand(clamped);
  const allowLong = opts.allowLong === true;
  const systemPrompt = buildSystemPrompt(clamped, band, allowLong, opts.retryBoost);

  return {
    systemPrompt,
    userPrompt: (source: string) => buildUserPrompt(source, clamped, band),
    band,
    degree: clamped,
  };
}
