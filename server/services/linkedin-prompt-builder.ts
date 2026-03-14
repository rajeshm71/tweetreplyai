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

  if (options.viewerIsOriginalAuthor && threadContext?.isReply && threadContext.threadLength > 1) {
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
    const chain = threadContext.threadChain ?? [];
    const commentEntry =
      chain.find((t) => t.isCurrent) ??
      chain[threadContext.currentTweetIndex] ??
      chain[chain.length - 1];
    const commentText = commentEntry?.text ?? postText;
    return `The original post:\n"${threadContext.originalPost}"\n\nThe comment you're replying to:\n"${commentText}"\n\nReply to the comment above.`;
  }

  return options.baseConfig.userPrompt(postText);
}
