import { Groq } from "groq-sdk";
import { AI_MODELS, AI_PARAMS, LINKEDIN_REPLY_LIMITS } from "../config/constants.js";
import {
  linkedInAnalysisAgents,
  type LinkedInPostAnalysis,
} from "./linkedin-analysis-agents.js";
import {
  buildLinkedInSystemPrompt,
  buildLinkedInUserPrompt,
  type LinkedInThreadContext,
} from "./linkedin-prompt-builder.js";
import { getLinkedInPromptConfig, LINKEDIN_SIMPLE_LANGUAGE_RULE } from "./prompts-linkedin.js";
import { getLinkedInOriginalAuthorPromptConfig } from "./prompts-linkedin-original-author.js";
import { applyReplyModeToPrompt } from "./prompts.js";
import { getDynamicReplyMaxWords } from "./oa-dynamic-reply-length.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { linkedInQualityChecker, getSelfReferentialRetryHint, hasSelfReferentialFraming } from "./linkedin-quality-checker.js";

// Lazy-init to keep unit tests fast and avoid Groq constructor work at import time.
let groqClient: Groq | null | undefined;
function getGroqClient(): Groq | null {
  if (groqClient !== undefined) return groqClient;
  groqClient = process.env.GROQ_API_KEY ? new Groq() : null;
  return groqClient;
}

export interface LinkedInReplyOptions {
  postText: string;
  postId?: string;
  promptVariation?: string;
  replyMode?: string;
  viewerIsOriginalAuthor?: boolean;
  authorInfo?: {
    username?: string;
    verified?: boolean;
    follower_count?: number;
  };
  threadContext?: LinkedInThreadContext;
}

function resolveLinkedInMaxWordsOverride(options: LinkedInReplyOptions): number {
  const defaultCap = LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS;

  if (!options.viewerIsOriginalAuthor) {
    return defaultCap;
  }

  const tc = options.threadContext;
  let targetText = options.postText;
  if (tc?.isReply && tc.threadChain?.length && tc.currentTweetIndex != null) {
    const current = tc.threadChain[tc.currentTweetIndex];
    if (current?.text?.trim()) {
      targetText = current.text;
    }
  }

  const dynamicMax = getDynamicReplyMaxWords(targetText);
  if (dynamicMax > 0) {
    return Math.min(dynamicMax, defaultCap);
  }
  return defaultCap;
}

/** Re-apply LinkedIn simple-language rule after X concise-mode prompt stripping. */
function applyLinkedInReplyModeToPrompt(
  baseConfig: ReturnType<typeof getLinkedInPromptConfig>,
  replyMode?: string,
) {
  let promptConfig = applyReplyModeToPrompt(baseConfig, replyMode);
  if (replyMode === "single-sentence") {
    promptConfig = {
      ...promptConfig,
      systemPrompt: promptConfig.systemPrompt + LINKEDIN_SIMPLE_LANGUAGE_RULE,
    };
  }
  return promptConfig;
}

const CONCISE_LINKEDIN_ANALYSIS: LinkedInPostAnalysis = {
  understanding: {
    tone: "neutral",
    sentiment: "neutral",
    style: "casual",
    contentType: "other",
    emotionalMarkers: [],
    keyThemes: [],
  },
  intention: {
    intention: "share",
    keyThemes: [],
    actionVerbs: [],
    underlyingPurpose: "",
  },
  enrichedContextPrompt: "",
  timestamp: new Date(0),
};

async function resolveLinkedInAnalysis(
  postText: string,
  replyMode?: string,
): Promise<LinkedInPostAnalysis> {
  if (replyMode === "single-sentence") {
    return CONCISE_LINKEDIN_ANALYSIS;
  }
  return linkedInAnalysisAgents.analyzePost(postText);
}

export interface LinkedInReplyResponse {
  reply: string;
  modelKey: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const groq = getGroqClient();
  if (!groq) {
    return {
      text: "Interesting perspective. The professional context here really resonates with how many practitioners think about this challenge.",
      tokensIn: 0,
      tokensOut: 0,
    };
  }

  const response = await groq.chat.completions.create({
    model: AI_MODELS.DEFAULT,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: AI_PARAMS.TEMPERATURE,
    max_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
    stream: false,
  });

  const text = response.choices[0]?.message?.content ?? "";
  const usage = response.usage;

  return {
    text,
    tokensIn: usage?.prompt_tokens ?? 0,
    tokensOut: usage?.completion_tokens ?? 0,
  };
}

export async function generateLinkedInReply(
  options: LinkedInReplyOptions,
): Promise<LinkedInReplyResponse> {
  const startTime = Date.now();
  const tc = options.threadContext;
  const commentOnComment = !!(tc?.isReply && tc?.threadLength != null && tc.threadLength > 1);
  console.log("[LinkedIn] generateLinkedInReply input:", {
    replyMode: options.replyMode ?? "enhanced",
    promptVariation: options.promptVariation ?? "default",
    viewerIsOriginalAuthor: options.viewerIsOriginalAuthor ?? false,
    isOther: !(options.viewerIsOriginalAuthor ?? false),
    hasThreadContext: !!tc,
    threadContext: tc
      ? {
          isReply: tc.isReply,
          threadLength: tc.threadLength,
          originalPostLen: tc.originalPost?.length ?? 0,
          threadChainLength: tc.threadChain?.length ?? 0,
          currentTweetIndex: tc.currentTweetIndex,
        }
      : null,
    commentOnCommentMode: commentOnComment,
  });

  const analysis = await resolveLinkedInAnalysis(options.postText, options.replyMode);

  const baseConfig = options.viewerIsOriginalAuthor
    ? getLinkedInOriginalAuthorPromptConfig(options.promptVariation)
    : getLinkedInPromptConfig(options.promptVariation);

  const promptConfig = applyLinkedInReplyModeToPrompt(baseConfig, options.replyMode);

  const systemPrompt = buildLinkedInSystemPrompt({
    baseConfig: promptConfig,
    analysis,
    postText: options.postText,
    viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
    threadContext: options.threadContext,
  });

  const userPrompt = buildLinkedInUserPrompt({
    baseConfig: promptConfig,
    postText: options.postText,
    viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
    threadContext: options.threadContext,
  });

  console.log("[LinkedIn] System prompt:", systemPrompt);
  console.log("[LinkedIn] User prompt:", userPrompt);

  let rawResult: { text: string; tokensIn: number; tokensOut: number };

  try {
    rawResult = await callGroq(systemPrompt, userPrompt);
  } catch (error: any) {
    console.error("[LinkedIn] LLM call failed:", error.message);
    return {
      reply: "Failed to generate reply. Please try again.",
      modelKey: AI_MODELS.DEFAULT,
      latencyMs: Date.now() - startTime,
    };
  }

  const maxWordsOverride = resolveLinkedInMaxWordsOverride(options);
  const processed = replyPostProcessor.processReply(
    rawResult.text,
    options.replyMode,
    maxWordsOverride,
  );

  const quality = linkedInQualityChecker.checkQuality(processed, options.postText);

  if (!quality.passed) {
    console.log(`[LinkedIn] Quality check failed (score: ${quality.totalScore}), retrying...`);

    try {
      const retryVariation =
        options.promptVariation === "default" || options.promptVariation === "x_default"
          ? "direct"
          : "default";
      const retryBaseConfig = options.viewerIsOriginalAuthor
        ? getLinkedInOriginalAuthorPromptConfig(retryVariation)
        : getLinkedInPromptConfig(retryVariation);
      const retryPromptConfig = applyLinkedInReplyModeToPrompt(retryBaseConfig, options.replyMode);

      const retrySystemPrompt = buildLinkedInSystemPrompt({
        baseConfig: retryPromptConfig,
        analysis,
        postText: options.postText,
        viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
        threadContext: options.threadContext,
      });

      const retryUserPromptBase = buildLinkedInUserPrompt({
        baseConfig: retryPromptConfig,
        postText: options.postText,
        viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
        threadContext: options.threadContext,
      });

      const retryUserPrompt =
        hasSelfReferentialFraming(processed)
          ? `${retryUserPromptBase}\n\n${getSelfReferentialRetryHint()}`
          : retryUserPromptBase;

      const retryResult = await callGroq(retrySystemPrompt, retryUserPrompt);
      const retryProcessed = replyPostProcessor.processReply(
        retryResult.text,
        options.replyMode,
        maxWordsOverride,
      );
      const retryQuality = linkedInQualityChecker.checkQuality(retryProcessed, options.postText);

      if (retryQuality.totalScore > quality.totalScore) {
        console.log(
          `[LinkedIn] Retry improved quality (${retryQuality.totalScore} vs ${quality.totalScore})`,
        );
        return {
          reply: retryProcessed,
          modelKey: AI_MODELS.DEFAULT,
          tokensIn: rawResult.tokensIn + retryResult.tokensIn,
          tokensOut: rawResult.tokensOut + retryResult.tokensOut,
          latencyMs: Date.now() - startTime,
        };
      }
    } catch (retryError: any) {
      console.log("[LinkedIn] Retry failed, using original reply");
    }
  }

  return {
    reply: processed,
    modelKey: AI_MODELS.DEFAULT,
    tokensIn: rawResult.tokensIn,
    tokensOut: rawResult.tokensOut,
    latencyMs: Date.now() - startTime,
  };
}
