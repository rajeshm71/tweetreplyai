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

  return prompt;
}

export function buildUserPromptWithThread(
  baseUserPrompt: string,
  threadContext?: PromptBuilderOptions['threadContext']
): string {
  let userPrompt = baseUserPrompt;
  if (threadContext?.isReply) {
    if (threadContext.originalTweet) {
      userPrompt += `\n\nNote: This tweet is a reply. The original tweet that started this conversation was: "${threadContext.originalTweet}"`;
    }
    if (threadContext.threadChain?.length > 1) {
      userPrompt += `\n\nFull conversation thread:`;
      threadContext.threadChain.forEach((tweet, idx) => {
        const label = tweet.isOriginal ? 'Original' : tweet.isCurrent ? 'Current (replying to)' : `Reply ${idx}`;
        userPrompt += `\n${label}: "${tweet.text}"`;
      });
    }
  }
  return userPrompt;
}
