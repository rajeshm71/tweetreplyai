export interface ParaphraseCheckResult {
  isLikelyRewrite: boolean;
  reason: string;
  overlapRatio: number;
  longestSharedSequenceWords: number;
}

const OVERLAP_FAIL_RATIO = 0.42;
const OVERLAP_FAIL_RATIO_SHORT_POST = 0.5;
const MIN_POST_CONTENT_WORDS = 6;
const MIN_POST_CONTENT_WORDS_SHORT = 3;
const MIN_SHARED_SEQUENCE_WORDS = 5;
const MIN_SHARED_SEQUENCE_WORDS_SHORT = 4;
const SHORT_POST_TOKEN_THRESHOLD = 8;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function contentWords(text: string): string[] {
  return tokenize(text).filter((w) => w.length > 4);
}

export function computeOverlapRatio(reply: string, postText: string): number {
  const postWords = contentWords(postText);
  if (postWords.length === 0) {
    return 0;
  }

  const replyTokens = new Set(tokenize(reply));
  const overlap = postWords.filter((w) => replyTokens.has(w)).length;
  return overlap / postWords.length;
}

export function longestConsecutiveSharedSequence(reply: string, postText: string): number {
  const postWords = tokenize(postText);
  const replyWords = tokenize(reply);
  if (postWords.length === 0 || replyWords.length === 0) {
    return 0;
  }

  let max = 0;
  for (let i = 0; i < postWords.length; i++) {
    for (let j = 0; j < replyWords.length; j++) {
      let len = 0;
      while (
        i + len < postWords.length &&
        j + len < replyWords.length &&
        postWords[i + len] === replyWords[j + len]
      ) {
        len++;
      }
      if (len > max) {
        max = len;
      }
    }
  }
  return max;
}

export function checkPostRewrite(reply: string, postText: string): ParaphraseCheckResult {
  if (!reply?.trim() || !postText?.trim()) {
    return {
      isLikelyRewrite: false,
      reason: "Empty reply or post",
      overlapRatio: 0,
      longestSharedSequenceWords: 0,
    };
  }

  const overlapRatio = computeOverlapRatio(reply, postText);
  const longestSharedSequenceWords = longestConsecutiveSharedSequence(reply, postText);
  const postContentWordCount = contentWords(postText).length;
  const postTokenCount = tokenize(postText).length;

  // Review fix: lower thresholds for short posts where rewrites are easier to miss.
  const isShortPost = postTokenCount < SHORT_POST_TOKEN_THRESHOLD;
  const sequenceThreshold = isShortPost
    ? MIN_SHARED_SEQUENCE_WORDS_SHORT
    : MIN_SHARED_SEQUENCE_WORDS;
  const overlapThreshold = isShortPost ? OVERLAP_FAIL_RATIO_SHORT_POST : OVERLAP_FAIL_RATIO;
  const minContentWordsForOverlap = isShortPost
    ? MIN_POST_CONTENT_WORDS_SHORT
    : MIN_POST_CONTENT_WORDS;

  if (longestSharedSequenceWords >= sequenceThreshold) {
    return {
      isLikelyRewrite: true,
      reason: `Reply shares ${longestSharedSequenceWords} consecutive words with the post`,
      overlapRatio,
      longestSharedSequenceWords,
    };
  }

  if (postContentWordCount >= minContentWordsForOverlap && overlapRatio >= overlapThreshold) {
    return {
      isLikelyRewrite: true,
      reason: `High vocabulary overlap with post (${Math.round(overlapRatio * 100)}%)`,
      overlapRatio,
      longestSharedSequenceWords,
    };
  }

  return {
    isLikelyRewrite: false,
    reason: "Reply uses original wording",
    overlapRatio,
    longestSharedSequenceWords,
  };
}

export function isLikelyPostRewrite(reply: string, postText: string): boolean {
  return checkPostRewrite(reply, postText).isLikelyRewrite;
}

export const POST_REWRITE_RETRY_HINT =
  "Write a short, natural reply in your own words.";
