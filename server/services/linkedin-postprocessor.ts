import { LINKEDIN_REPLY_LIMITS } from "../config/constants.js";

const LINKEDIN_CLICHE_PATTERNS = [
  /\blet'?s connect\b/gi,
  /\bsynergy\b/gi,
  /\bvalue.?add\b/gi,
  /\bcircle back\b/gi,
  /\btouch base\b/gi,
  /\bmoving forward\b/gi,
  /\bdeep dive\b/gi,
  /\bleverage\b/gi,
  /\bpivot\b/gi,
  /\bgame[- ]?changer\b/gi,
  /\bdisruptive\b/gi,
  /\bthought leader(ship)?\b/gi,
  /\bpassionate about\b/gi,
  /\bexcited to share\b/gi,
  /\bhonored to announce\b/gi,
  /\bhumbled (and honored|to)\b/gi,
  /\bincredibly excited\b/gi,
  /\bblessing in disguise\b/gi,
  /^(great post|great insight|great point|amazing post|so true|absolutely|love this|this is so|wow,? this)[^a-z]/i,
];

/** Replacements for cliché phrases so output text is actually modified. */
const CLICHE_REPLACEMENTS: Array<{ pattern: RegExp; replacement: string }> = [
  [/\bgame[- ]?changer\b/gi, "very useful resource"],
  [/\blet'?s connect\b/gi, "feel free to connect"],
  [/\bsynergy\b/gi, "good fit"],
  [/\bvalue[- ]?add\b/gi, "value"],
  [/\bcircle back\b/gi, "follow up"],
  [/\btouch base\b/gi, "connect"],
  [/\bdeep dive\b/gi, "deep look"],
  [/\bleverage\b/gi, "use"],
  [/\bthought leader(ship)?\b/gi, "expert"],
  [/\bdisruptive\b/gi, "transformative"],
].map(([p, r]) => ({ pattern: p as RegExp, replacement: r }));

/** Same as X: hollow openers to strip from the start of the reply. */
const START_PHRASES = [
  "Couldn't agree more",
  "Preach",
  "Spot on",
  "Sounds like",
  "Feels like",
  "Looks like",
  "Seems like",
  "makes sense",
];

const META_COMMENTARY_PATTERNS = [
  /^(here'?s? (a |my )?(possible |sample |potential )?reply[:\s])/i,
  /^(reply[:\s])/i,
  /^(response[:\s])/i,
  /^(comment[:\s])/i,
  /^(this (is |would be )?(a |my )?reply)/i,
  /^(i (would|could|might) (say|write|reply))/i,
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripRemovableStartPhrases(text: string): string {
  if (!text || !text.trim()) return text;
  let cleaned = text.trim();
  for (const phrase of START_PHRASES) {
    const escaped = escapeRegex(phrase);
    const withPunct = new RegExp(`^${escaped}\\s*[.,!?:;]+\\s*`, "i");
    if (withPunct.test(cleaned)) {
      cleaned = cleaned.replace(withPunct, "").trim();
      break;
    }
    const withSpace = new RegExp(`^${escaped}\\s+`, "i");
    if (withSpace.test(cleaned)) {
      cleaned = cleaned.replace(withSpace, "").trim();
      break;
    }
  }
  return cleaned;
}

function stripLeadingTrailingQuotes(text: string): string {
  return text.replace(/^[\s"'\u201C\u201D\u2018\u2019]+|[\s"'\u201C\u201D\u2018\u2019]+$/g, "").trim();
}

function replaceExclamationWithPeriod(text: string): string {
  return text.replace(/!/g, ".");
}

/** Same as X: replace em/en dashes with space; preserve digit-digit (e.g. 9-5). */
function replaceDashes(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/(\d)[—–](\d)/g, "$1-$2");
  cleaned = cleaned.replace(/—/g, " ").replace(/–/g, " ");
  cleaned = cleaned.replace(/(\w)-(\w)/g, (match, before, after) => {
    if (/\d/.test(before) && /\d/.test(after)) return match;
    return `${before} ${after}`;
  });
  cleaned = cleaned.replace(/\s+-\s+/g, " ");
  cleaned = cleaned.replace(/^-\s+/g, "");
  cleaned = cleaned.replace(/\s+-$/g, "");
  return cleaned;
}

function replaceClichéPhrases(text: string): string {
  let result = text;
  for (const { pattern, replacement } of CLICHE_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function stripMetaCommentary(text: string): string {
  const lines = text.split("\n");

  if (META_COMMENTARY_PATTERNS.some((p) => p.test(lines[0]?.trim() ?? ""))) {
    const remaining = lines.slice(1).join("\n").trim();
    if (remaining.length > 10) return remaining;
  }

  return text;
}

function warnClicheUsage(text: string): void {
  const found = LINKEDIN_CLICHE_PATTERNS.filter((p) => p.test(text)).map((p) =>
    p.source.replace(/\\b/g, "").replace(/[^a-z'?\s.]/gi, ""),
  );
  if (found.length > 0) {
    console.warn("[LinkedInPostprocessor] Cliché patterns detected:", found.join(", "));
  }
}

export const linkedInPostProcessor = {
  processReply(rawText: string): string {
    if (!rawText || typeof rawText !== "string") return "";

    let text = rawText.trim();
    text = stripLeadingTrailingQuotes(text);

    text = stripMetaCommentary(text);

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    text = stripRemovableStartPhrases(text);

    text = replaceClichéPhrases(text);
    text = replaceExclamationWithPeriod(text);
    text = replaceDashes(text);

    warnClicheUsage(text);

    if (countWords(text) < LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MIN_WORDS) {
      console.warn("[LinkedInPostprocessor] Reply too short after processing, returning processed text");
      return text;
    }

    return text;
  },
};
