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
  // Optional handles used only for internal role disambiguation in prompts.
  replyAuthorHandle?: string;
  targetAuthorHandle?: string;
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

  // Anchor persona: for regular replies, reinforce that we write as the logged-in user,
  // not as the author of the tweet being replied to.
  // Skipped for original-author replies because the base prompt already contains that persona.
  if (!options.viewerIsOriginalAuthor) {
    prompt +=
      '\n\nYou are writing a reply on behalf of the logged-in user (the person sending this reply). ' +
      'Always write from their point of view, speaking to the author of the tweet they are replying to. ' +
      'Do not write as if you are the author of that tweet.';
  }

  // When we know both handles, give the model explicit internal role labels while
  // explicitly forbidding it from introducing new handles in the reply text.
  if (options.replyAuthorHandle && options.targetAuthorHandle) {
    prompt +=
      '\n\nInternally, treat the reply author as @' +
      options.replyAuthorHandle +
      ' and the tweet author they are responding to as @' +
      options.targetAuthorHandle +
      '. Write the reply from the reply author\'s point of view, speaking to the tweet author.';

    prompt +=
      ' Do not introduce or mention any usernames or handles in the reply text that are not already present in the tweet or thread. ' ;
  }

  return prompt;
}

export function buildUserPromptWithThread(
  baseUserPrompt: string,
  threadContext?: PromptBuilderOptions['threadContext'],
  handles?: { replyAuthorHandle?: string; targetAuthorHandle?: string }
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

    // Make the target tweet explicit so the model replies to the correct message.
    userPrompt +=
      '\n\nThe tweet you are replying to is the one shown above as Tweet: "...". ' +
      'The original tweet and other replies listed here are background context only. ';

    // When handle information is available, reinforce roles generically (without
    // surfacing actual handles).
    if (handles?.replyAuthorHandle && handles?.targetAuthorHandle) {
      userPrompt +=
        'You are writing on behalf of the person who will send this reply (the reply author), responding to that tweet written by another user (the tweet author). ';
    }

    userPrompt +=
      'Write a reply that directly responds to that tweet from the logged-in user\'s perspective.';
  }
  return userPrompt;
}
