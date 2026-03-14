/**
 * OA dynamic reply length: derive max words and word range from comment length.
 * All tier data comes from config (OA_DYNAMIC_REPLY_TIERS); no hardcoded numbers here.
 */
import { OA_DYNAMIC_REPLY_TIERS } from "../config/constants.js";

function getCommentWordCount(commentText: string): number {
  if (!commentText || typeof commentText !== "string") return 0;
  return commentText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

function getTierForCommentWordCount(commentWords: number): (typeof OA_DYNAMIC_REPLY_TIERS)[number] {
  for (const tier of OA_DYNAMIC_REPLY_TIERS) {
    if (commentWords <= tier.commentWordMax) return tier;
  }
  return OA_DYNAMIC_REPLY_TIERS[OA_DYNAMIC_REPLY_TIERS.length - 1];
}

/**
 * Returns the max reply words for post-processor cap when OA replying to this comment.
 */
export function getDynamicReplyMaxWords(commentText: string): number {
  const commentWords = getCommentWordCount(commentText);
  if (commentWords === 0) return 0;
  return getTierForCommentWordCount(commentWords).replyMaxWords;
}

/**
 * Returns the reply word range for prompt wording (e.g. "Keep your reply to 1–5 words").
 */
export function getDynamicReplyWordRange(
  commentText: string
): { min: number; max: number } | null {
  const commentWords = getCommentWordCount(commentText);
  if (commentWords === 0) return null;
  const tier = getTierForCommentWordCount(commentWords);
  return { min: tier.replyMinWords, max: tier.replyMaxWords };
}
