import type { EnrichedTweetAnalysis } from "./tweet-analysis-agents.js";
// Top-level import for consistency with routes and to avoid dynamic import when module is already loaded
import { tweetContextAnalyzer } from "./tweet-context.js";

interface PromptBuilderOptions {
  baseSystemPrompt: string;
  tweetAnalysis?: EnrichedTweetAnalysis;
  tweetContext?: any;
  authorInfo?: {
    username?: string;
    verified?: boolean;
    follower_count?: number;
  };
  threadContext?: {
    isReply: boolean;
    originalTweet: string | null;
    originalTweetAuthor: string | null;
    threadChain: Array<{
      text: string;
      author: string;
      isOriginal: boolean;
      isCurrent: boolean;
    }>;
    currentTweetIndex: number;
    threadLength: number;
  };
  viewerIsOriginalAuthor?: boolean;
}

export async function buildSystemPrompt(options: PromptBuilderOptions): Promise<string> {
  let prompt = options.baseSystemPrompt;

  if (options.tweetAnalysis?.enrichedContextPrompt) {
    prompt = `${options.tweetAnalysis.enrichedContextPrompt}\n\n${prompt}`;
  }

  if (options.tweetContext) {
    const authorInfo = options.authorInfo?.username ? {
      username: options.authorInfo.username,
      verified: options.authorInfo.verified || false,
      followerCount: options.authorInfo.follower_count || 0
    } : undefined;
    const conversationContext = options.threadContext ? {
      parentTweets: options.threadContext.threadChain.map(t => t.text),
      threadLength: options.threadContext.threadLength,
      isThread: options.threadContext.isReply,
      originalTweet: options.threadContext.originalTweet,
      originalTweetAuthor: options.threadContext.originalTweetAuthor,
      threadChain: options.threadContext.threadChain,
      currentTweetIndex: options.threadContext.currentTweetIndex
    } : undefined;
    const contextPrompt = tweetContextAnalyzer.generateContextPrompt(
      options.tweetContext,
      authorInfo,
      conversationContext
    );
    if (contextPrompt) {
      prompt = `${prompt}\n\n${contextPrompt}`;
    }
  }

  if (options.viewerIsOriginalAuthor === true) {
    prompt += '\n\nThe user writing the reply is the original author of the tweet they are replying to.';
  }

  return prompt;
}

export function buildUserPromptWithThread(
  baseUserPrompt: string,
  threadContext?: PromptBuilderOptions['threadContext']
): string {
  let userPrompt = baseUserPrompt;
  if (threadContext?.isReply && threadContext.threadLength > 1) {
    if (threadContext.originalTweet) {
      userPrompt += `\n\nNote: This tweet is a reply. The original tweet that started this conversation was: "${threadContext.originalTweet}"`;
    }
    if (threadContext.threadChain?.length > 1) {
      userPrompt += `\n\nFull conversation thread:`;
      let replyIndex = 0;
      threadContext.threadChain.forEach((tweet) => {
        if (tweet.isOriginal || tweet.isCurrent) return; // already in Note and at top
        replyIndex += 1;
        userPrompt += `\nReply ${replyIndex}: "${tweet.text}"`;
      });
    }
  }
  return userPrompt;
}
