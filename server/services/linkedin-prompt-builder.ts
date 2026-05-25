import type { LinkedInPostAnalysis } from "./linkedin-analysis-agents.js";
import { linkedInContextAnalyzer } from "./linkedin-context.js";
import type { LinkedInPromptConfig } from "./prompts-linkedin.js";

/** Thread context for LinkedIn replies; field names use "post" for LinkedIn clarity. */
export interface LinkedInThreadContext {
  isReply: boolean;
  /** Original post (not tweet) being commented on. */
  originalPost: string | null;
  originalPostAuthor: string | null;
  threadChain: Array<{ text: string; author: string; isOriginal: boolean; isCurrent: boolean }>;
  /** Index of the comment being replied to in the chain (name kept for shared API schema compatibility). */
  currentTweetIndex: number;
  threadLength: number;
}

interface LinkedInPromptBuilderOptions {
  baseConfig: LinkedInPromptConfig;
  analysis: LinkedInPostAnalysis;
  postText: string;
  viewerIsOriginalAuthor?: boolean;
  threadContext?: LinkedInThreadContext;
}

export function buildLinkedInSystemPrompt(options: LinkedInPromptBuilderOptions): string {
  let prompt = options.baseConfig.systemPrompt;

  if (options.analysis.enrichedContextPrompt) {
    prompt = `${options.analysis.enrichedContextPrompt}\n\n${prompt}`;
  }

  const contextPrompt = linkedInContextAnalyzer.generateContextPrompt(
    options.analysis,
    options.viewerIsOriginalAuthor ?? false,
    options.threadContext
      ? {
          isReply: options.threadContext.isReply,
          threadLength: options.threadContext.threadLength,
          originalPost: options.threadContext.originalPost,
        }
      : undefined,
  );

  // Review fix: Do not add a second "write on behalf of the logged-in user" block here.
  // generateContextPrompt() already adds it when !viewerIsOriginalAuthor; duplicating
  // it would bloat the prompt and was removed per code review.
  if (contextPrompt) {
    prompt = `${prompt}\n\n${contextPrompt}`;
  }

  return prompt;
}

export function buildLinkedInUserPrompt(
  options: Pick<
    LinkedInPromptBuilderOptions,
    "baseConfig" | "postText" | "threadContext" | "viewerIsOriginalAuthor"
  >,
): string {
  const { threadContext, postText } = options;
  const isOA = options.viewerIsOriginalAuthor ?? false;

  if (options.viewerIsOriginalAuthor && threadContext?.isReply && threadContext.threadLength > 1) {
    console.log("[LinkedIn] buildLinkedInUserPrompt: branch = OA replying to comment (comment-on-comment)", {
      viewerIsOriginalAuthor: true,
      threadLength: threadContext.threadLength,
      isReplyToComment: true,
    });
    const chain = threadContext.threadChain ?? [];
    const commentEntry =
      chain.find((t) => t.isCurrent) ??
      chain[threadContext.currentTweetIndex] ??
      chain[chain.length - 1];
    const commentText = commentEntry?.text ?? postText;
    const post = threadContext.originalPost ?? postText;
    return `Your post:\n"${post}"\n\nThe comment you're replying to:\n"${commentText}"\n\nReply to the comment above.`;
  }

  if (threadContext?.isReply && threadContext.originalPost) {
    console.log("[LinkedIn] buildLinkedInUserPrompt: branch = other replying to comment (comment-on-comment)", {
      viewerIsOriginalAuthor: false,
      threadLength: threadContext.threadLength,
      isReplyToComment: true,
    });
    const chain = threadContext.threadChain ?? [];
    const commentEntry =
      chain.find((t) => t.isCurrent) ??
      chain[threadContext.currentTweetIndex] ??
      chain[chain.length - 1];
    const commentText = commentEntry?.text ?? postText;
    return `The original post:\n"${threadContext.originalPost}"\n\nThe comment you're replying to:\n"${commentText}"\n\nReply to the comment above.`;
  }

  console.log("[LinkedIn] buildLinkedInUserPrompt: branch = reply to post only (no comment-on-comment)", {
    viewerIsOriginalAuthor: isOA,
    hasThreadContext: !!threadContext,
    threadLength: threadContext?.threadLength ?? 0,
    isReplyToComment: false,
    reason: !threadContext ? "no threadContext" : !threadContext.isReply ? "isReply false" : (threadContext.threadLength ?? 0) <= 1 ? "threadLength <= 1" : "unknown",
  });
  return options.baseConfig.userPrompt(postText);
}

/** Text to compare replies against for rewrite detection — matches the comment/post the model replies to. */
export function resolveLinkedInQualityTargetText(
  postText: string,
  threadContext?: LinkedInThreadContext,
): string {
  if (threadContext?.isReply && (threadContext.threadLength ?? 0) > 1) {
    const chain = threadContext.threadChain ?? [];
    const commentEntry =
      chain.find((t) => t.isCurrent) ??
      chain[threadContext.currentTweetIndex] ??
      chain[chain.length - 1];
    const commentText = commentEntry?.text?.trim();
    if (commentText) {
      return commentText;
    }
  }
  return postText;
}
