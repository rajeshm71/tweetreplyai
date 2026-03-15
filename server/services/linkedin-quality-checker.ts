import { LINKEDIN_REPLY_LIMITS } from "../config/constants.js";

interface LinkedInQualityParameter {
  name: string;
  score: number;
  maxScore: number;
  reason: string;
}

export interface LinkedInQualityResult {
  passed: boolean;
  totalScore: number;
  parameters: LinkedInQualityParameter[];
}

const LINKEDIN_CLICHE_WORDS = [
  "synergy",
  "leverage",
  "pivot",
  "game-changer",
  "disruptive",
  "thought leader",
  "value-add",
  "circle back",
  "touch base",
  "deep dive",
  "moving forward",
  "let's connect",
  "passionate about",
  "excited to share",
  "honored to announce",
  "humbled",
];

const HOLLOW_OPENERS = [
  /^great post/i,
  /^great insight/i,
  /^great point/i,
  /^amazing post/i,
  /^so true/i,
  /^absolutely[!.,]/i,
  /^love this/i,
  /^this is so inspiring/i,
  /^wow,?\s/i,
  /^very insightful/i,
  /^100%/,
  // Same as X start phrases (in case any slip through post-processor)
  /^couldn't agree more/i,
  /^preach/i,
  /^spot on/i,
  /^sounds like/i,
  /^feels like/i,
  /^looks like/i,
  /^seems like/i,
  /^makes sense/i,
];

const META_COMMENTARY = [
  /^here'?s? (a |my )?(possible |sample )?reply/i,
  /^(reply|response|comment):/i,
  /^i (would|could) (say|reply|write)/i,
];

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function checkWordCount(reply: string): LinkedInQualityParameter {
  const words = countWords(reply);
  const max = LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS;
  const min = LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MIN_WORDS;

  if (words < min) {
    return { name: "word_count", score: 0, maxScore: 20, reason: `Too short: ${words} words` };
  }
  if (words <= 15) {
    return { name: "word_count", score: 15, maxScore: 20, reason: `Concise: ${words} words` };
  }
  if (words <= max) {
    return { name: "word_count", score: 20, maxScore: 20, reason: `Good length: ${words} words` };
  }
  return { name: "word_count", score: 8, maxScore: 20, reason: `Too long: ${words} words (max ${max})` };
}

function checkNoClicheLanguage(reply: string): LinkedInQualityParameter {
  const lower = reply.toLowerCase();
  const found = LINKEDIN_CLICHE_WORDS.filter((w) => lower.includes(w.toLowerCase()));
  if (found.length === 0) {
    return { name: "no_cliche_language", score: 20, maxScore: 20, reason: "No LinkedIn clichés detected" };
  }
  const deduction = Math.min(20, found.length * 7);
  return {
    name: "no_cliche_language",
    score: Math.max(0, 20 - deduction),
    maxScore: 20,
    reason: `Clichés found: ${found.slice(0, 3).join(", ")}`,
  };
}

function checkNoHollowOpener(reply: string): LinkedInQualityParameter {
  const hasHollow = HOLLOW_OPENERS.some((p) => p.test(reply.trim()));
  if (hasHollow) {
    return { name: "no_hollow_opener", score: 0, maxScore: 20, reason: "Starts with hollow affirmation" };
  }
  return { name: "no_hollow_opener", score: 20, maxScore: 20, reason: "No hollow opener" };
}

function checkNoMetaCommentary(reply: string): LinkedInQualityParameter {
  const hasMeta = META_COMMENTARY.some((p) => p.test(reply.trim()));
  if (hasMeta) {
    return { name: "no_meta_commentary", score: 0, maxScore: 20, reason: "Contains meta-commentary about the reply" };
  }
  return { name: "no_meta_commentary", score: 20, maxScore: 20, reason: "No meta-commentary" };
}

function checkSubstance(reply: string, postText: string): LinkedInQualityParameter {
  const replyLower = reply.toLowerCase();
  const postWords = postText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);

  const overlap = postWords.filter((w) => replyLower.includes(w)).length;
  const overlapRatio = postWords.length > 0 ? overlap / postWords.length : 0;

  if (overlapRatio > 0.6) {
    return {
      name: "substance",
      score: 5,
      maxScore: 20,
      reason: "Reply mostly repeats the post — lacks original substance",
    };
  }

  const words = countWords(reply);
  if (words >= 8) {
    return { name: "substance", score: 20, maxScore: 20, reason: "Reply adds substance" };
  }

  return { name: "substance", score: 12, maxScore: 20, reason: "Reply is brief but substantive" };
}

const LINKEDIN_QUALITY_PASS_SCORE = 55;

export const linkedInQualityChecker = {
  checkQuality(reply: string, postText: string): LinkedInQualityResult {
    if (!reply || typeof reply !== "string" || reply.trim().length === 0) {
      return {
        passed: false,
        totalScore: 0,
        parameters: [{ name: "empty", score: 0, maxScore: 100, reason: "Empty reply" }],
      };
    }

    const parameters: LinkedInQualityParameter[] = [
      checkWordCount(reply),
      checkNoClicheLanguage(reply),
      checkNoHollowOpener(reply),
      checkNoMetaCommentary(reply),
      checkSubstance(reply, postText),
    ];

    const totalScore = parameters.reduce((sum, p) => sum + p.score, 0);
    const passed = totalScore >= LINKEDIN_QUALITY_PASS_SCORE;

    return { passed, totalScore, parameters };
  },
};
