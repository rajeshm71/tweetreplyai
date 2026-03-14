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
  /\bgame.?changer\b/gi,
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

const META_COMMENTARY_PATTERNS = [
  /^(here'?s? (a |my )?(possible |sample |potential )?reply[:\s])/i,
  /^(reply[:\s])/i,
  /^(response[:\s])/i,
  /^(comment[:\s])/i,
  /^(this (is |would be )?(a |my )?reply)/i,
  /^(i (would|could|might) (say|write|reply))/i,
];

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

function trimToWordLimit(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();

  const trimmed = words.slice(0, maxWords).join(" ");

  const lastPunctuation = trimmed.search(/[.!?][^.!?]*$/);
  if (lastPunctuation > trimmed.length * 0.6) {
    return trimmed.substring(0, lastPunctuation + 1);
  }

  return trimmed + "…";
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

    text = stripMetaCommentary(text);

    text = text.replace(/\n{3,}/g, "\n\n").trim();

    warnClicheUsage(text);

    const wordCount = countWords(text);
    if (wordCount > LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS) {
      text = trimToWordLimit(text, LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS);
    }

    if (countWords(text) < LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MIN_WORDS) {
      console.warn("[LinkedInPostprocessor] Reply too short after processing, using raw text");
      return rawText.trim();
    }

    return text;
  },
};
