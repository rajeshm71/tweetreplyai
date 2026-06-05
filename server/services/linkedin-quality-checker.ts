import { LINKEDIN_REPLY_LIMITS } from "../config/constants.js";
import { checkPostRewrite } from "./linkedin-reply-similarity.js";

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
  /^this seems/i,
  /^this feels/i,
  /^this looks/i,
  /^this sounds/i,
  /^it seems/i,
  /^it feels/i,
];

const HEDGING_IN_REPLY = [
  /\b(this|it) (seems|feels|looks|sounds)\b/i,
  /\b(seems|feels) (important|critical|key|worth|right|true)\b/i,
];

const META_COMMENTARY = [
  /^here'?s? (a |my )?(possible |sample )?reply/i,
  /^(reply|response|comment):/i,
  /^i (would|could) (say|reply|write)/i,
];

export const SELF_REFERENTIAL_PATTERNS = [
  /^i('ve| have) seen/i,
  /^i('ve| have) (done|built|implemented|shipped|worked|led|run|managed)/i,
  /^when (i|we) /i,
  /^i (completely )?agree/i,
  /^this resonates/i,
  /^in (my|our) (experience|courses|organization|team|role|company|work)/i,
  /\bin our own (courses|programs|work)/i,
  /^we('ve| have) (seen|found|done|built|shipped)/i,
  /^couldn'?t agree more/i,
  /^spot on/i,
];

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function hasSelfReferentialFraming(reply: string): boolean {
  const trimmed = reply.trim();
  return SELF_REFERENTIAL_PATTERNS.some((p) => p.test(trimmed));
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
  const trimmed = reply.trim();
  const hasHollow = HOLLOW_OPENERS.some((p) => p.test(trimmed));
  if (hasHollow) {
    return { name: "no_hollow_opener", score: 0, maxScore: 20, reason: "Starts with hollow affirmation" };
  }
  return { name: "no_hollow_opener", score: 20, maxScore: 20, reason: "No hollow opener" };
}

function checkDirectStatements(reply: string): LinkedInQualityParameter {
  const trimmed = reply.trim();
  if (HEDGING_IN_REPLY.some((p) => p.test(trimmed))) {
    return {
      name: "direct_statements",
      score: 0,
      maxScore: 20,
      reason: "Uses hedging (seems/feels) instead of direct statements",
    };
  }
  return {
    name: "direct_statements",
    score: 20,
    maxScore: 20,
    reason: "Uses direct, definitive wording",
  };
}

function checkNoMetaCommentary(reply: string): LinkedInQualityParameter {
  const hasMeta = META_COMMENTARY.some((p) => p.test(reply.trim()));
  if (hasMeta) {
    return { name: "no_meta_commentary", score: 0, maxScore: 20, reason: "Contains meta-commentary about the reply" };
  }
  return { name: "no_meta_commentary", score: 20, maxScore: 20, reason: "No meta-commentary" };
}

function checkNoSelfReferentialFraming(reply: string): LinkedInQualityParameter {
  if (hasSelfReferentialFraming(reply)) {
    return {
      name: "no_self_referential_framing",
      score: 0,
      maxScore: 20,
      reason: "Self-referential or first-person agreement framing detected",
    };
  }
  return {
    name: "no_self_referential_framing",
    score: 20,
    maxScore: 20,
    reason: "No self-referential framing",
  };
}

function checkOriginalWording(reply: string, postText: string): LinkedInQualityParameter {
  const rewrite = checkPostRewrite(reply, postText);
  if (rewrite.isLikelyRewrite) {
    return {
      name: "original_wording",
      score: 0,
      maxScore: 20,
      reason: rewrite.reason,
    };
  }
  return {
    name: "original_wording",
    score: 20,
    maxScore: 20,
    reason: "Reply uses original wording",
  };
}

function checkSubstance(reply: string): LinkedInQualityParameter {
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
      checkDirectStatements(reply),
      checkNoMetaCommentary(reply),
      checkNoSelfReferentialFraming(reply),
      checkOriginalWording(reply, postText),
      checkSubstance(reply),
    ];

    const totalScore = parameters.reduce((sum, p) => sum + p.score, 0);
    const selfRefParam = parameters.find((p) => p.name === "no_self_referential_framing");
    const originalWordingParam = parameters.find((p) => p.name === "original_wording");
    const directStatementsParam = parameters.find((p) => p.name === "direct_statements");
    const passed =
      totalScore >= LINKEDIN_QUALITY_PASS_SCORE &&
      (selfRefParam?.score ?? 20) > 0 &&
      (originalWordingParam?.score ?? 20) > 0 &&
      (directStatementsParam?.score ?? 20) > 0;

    return { passed, totalScore, parameters };
  },
};
