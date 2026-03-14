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
      conversationContext,
      options.viewerIsOriginalAuthor
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
    if (options.viewerIsOriginalAuthor) {
      prompt +=
        '\n\nInternally: you (reply author) are @' +
        options.replyAuthorHandle +
        ', the person you are replying to is @' +
        options.targetAuthorHandle +
        '. Do not introduce or mention any usernames or handles in the reply text that are not already present in the tweet or thread.';
    } else {
      prompt +=
        '\n\nInternally, treat the reply author as @' +
        options.replyAuthorHandle +
        ' and the tweet author they are responding to as @' +
        options.targetAuthorHandle +
        '. Write the reply from the reply author\'s point of view, speaking to the tweet author.';

      prompt +=
        ' Do not introduce or mention any usernames or handles in the reply text that are not already present in the tweet or thread. ' ;
    }
  }

  return prompt;
}

function normalizeHandle(handle: string | null | undefined): string {
  if (handle == null || handle === '') return '';
  return handle.trim().replace(/^@+/, '').toLowerCase();
}

/** Returns speaker label for OA prompt: "You", "@handle", or "Them". */
function getSpeakerLabel(author: string | null | undefined, originalAuthorNorm: string): string {
  if (originalAuthorNorm !== '' && normalizeHandle(author) === originalAuthorNorm) return 'You';
  const a = author?.trim();
  if (a && a !== '' && a.toLowerCase() !== 'unknown') return '@' + a.replace(/^@+/, '');
  return 'Them';
}

export function buildUserPromptWithThread(
  baseUserPrompt: string,
  threadContext?: PromptBuilderOptions['threadContext'],
  handles?: { replyAuthorHandle?: string; targetAuthorHandle?: string },
  viewerIsOriginalAuthor?: boolean
): string {
  if (!threadContext?.isReply || threadContext.threadLength <= 1) {
    return baseUserPrompt;
  }

  // Original author with thread: build OA-specific prompt (no duplication, chronological order).
  if (viewerIsOriginalAuthor) {
    const originalTweet = threadContext.originalTweet ?? '';
    const chain = threadContext.threadChain ?? [];
    const currentEntry = chain.find((t) => t.isCurrent) ?? chain[threadContext.currentTweetIndex] ?? chain[chain.length - 1];
    const currentTweetText = currentEntry?.text ?? '';

    // Single comment: your tweet + the one comment + minimal instruction.
    if (threadContext.threadLength === 2) {
      return (
        `Your tweet that started this conversation:\n"${originalTweet}"` +
        `\n\nThe comment you're replying to:\n"${currentTweetText}"` +
        `\n\nReply to the comment above.`
      );
    }

    // Multi-turn: need to attribute You/Them. Fall back to single-comment if we can't.
    const originalAuthorNorm = normalizeHandle(threadContext.originalTweetAuthor);
    const canAttribute =
      originalAuthorNorm !== '' &&
      chain.some((t) => !t.isOriginal && t.author !== 'unknown' && normalizeHandle(t.author) !== '');

    if (!canAttribute) {
      return (
        `Your tweet that started this conversation:\n"${originalTweet}"` +
        `\n\nThe comment you're replying to:\n"${currentTweetText}"` +
        `\n\nReply to the comment above.`
      );
    }

    const lines: string[] = [
      `Your tweet that started this conversation:\n"${originalTweet}"`,
      'Conversation so far:',
    ];
    chain.forEach((tweet) => {
      if (tweet.isOriginal) return;
      const label = getSpeakerLabel(tweet.author, originalAuthorNorm);
      lines.push(`${label}: "${tweet.text}"`);
    });
    const targetLabel = getSpeakerLabel(currentEntry?.author, originalAuthorNorm);
    lines.push(`You are replying to this message from ${targetLabel}: "${currentTweetText}"`);
    lines.push('Write your reply to that message.');
    return lines.join('\n');
  }

  // Non–original-author: existing thread block appended to baseUserPrompt.
  let userPrompt = baseUserPrompt;
  if (threadContext.originalTweet) {
    userPrompt += `\n\nNote: This tweet is a reply. The original tweet that started this conversation was: "${threadContext.originalTweet}"`;
  }
  if (threadContext.threadChain?.length > 1) {
    userPrompt += `\n\nFull conversation thread:`;
    let replyIndex = 0;
    threadContext.threadChain.forEach((tweet) => {
      if (tweet.isOriginal || tweet.isCurrent) return;
      replyIndex += 1;
      userPrompt += `\nReply ${replyIndex}: "${tweet.text}"`;
    });
  }

  userPrompt +=
    '\n\nThe tweet you are replying to is the one shown above as Tweet: "...". ' +
    'The original tweet and other replies listed here are background context only. ';

  if (handles?.replyAuthorHandle && handles?.targetAuthorHandle) {
    userPrompt +=
      'You are writing on behalf of the person who will send this reply (the reply author), responding to that tweet written by another user (the tweet author). ';
  }
  userPrompt +=
    'Write a reply that directly responds to that tweet from the logged-in user\'s perspective.';

  return userPrompt;
}
