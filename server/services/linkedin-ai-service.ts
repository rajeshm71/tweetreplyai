import { LINKEDIN_REPLY_LIMITS } from "../config/constants.js";
import { getGroqTertiaryModel } from "../config/model-routing.js";
import { aiRouter } from "./ai-router.js";
import {
  linkedInAnalysisAgents,
  type LinkedInPostAnalysis,
} from "./linkedin-analysis-agents.js";
import {
  buildLinkedInSystemPrompt,
  buildLinkedInUserPrompt,
  resolveLinkedInQualityTargetText,
  type LinkedInThreadContext,
} from "./linkedin-prompt-builder.js";
import { getLinkedInPromptConfig, LINKEDIN_ENHANCED_OBSERVATION_RULE, LINKEDIN_SIMPLE_LANGUAGE_RULE } from "./prompts-linkedin.js";
import { getLinkedInOriginalAuthorPromptConfig } from "./prompts-linkedin-original-author.js";
import { applyReplyModeToPrompt } from "./prompts.js";
import { getDynamicReplyMaxWords } from "./oa-dynamic-reply-length.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { linkedInQualityChecker, type LinkedInQualityResult } from "./linkedin-quality-checker.js";
import {
  isLikelyPostRewrite,
  POST_DIRECT_STATEMENT_RETRY_HINT,
  POST_REWRITE_RETRY_HINT,
  POST_SELF_REF_RETRY_HINT,
} from "./linkedin-reply-similarity.js";

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
  } else {
    promptConfig = {
      ...promptConfig,
      systemPrompt: promptConfig.systemPrompt + LINKEDIN_ENHANCED_OBSERVATION_RULE,
    };
  }
  return promptConfig;
}

/** Review fix: only accept retry when it passes or clearly improves original wording — not score alone. */
export function shouldAcceptLinkedInRetryQuality(
  retryQuality: LinkedInQualityResult,
  originalQuality: LinkedInQualityResult,
): boolean {
  if (retryQuality.passed) {
    return true;
  }

  const retryOriginalScore =
    retryQuality.parameters.find((p) => p.name === "original_wording")?.score ?? 0;
  const originalOriginalScore =
    originalQuality.parameters.find((p) => p.name === "original_wording")?.score ?? 0;

  if (retryOriginalScore > 0 && retryOriginalScore > originalOriginalScore) {
    return true;
  }

  return (
    retryQuality.totalScore > originalQuality.totalScore &&
    retryOriginalScore > 0
  );
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

async function callLinkedInModel(
  systemPrompt: string,
  userPrompt: string,
): Promise<{ text: string; tokensIn: number; tokensOut: number; modelKey: string }> {
  const response = await aiRouter.generateLinkedInCompletion(systemPrompt, userPrompt);
  return {
    text: response.reply,
    tokensIn: response.tokensIn ?? 0,
    tokensOut: response.tokensOut ?? 0,
    modelKey: response.modelKey,
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

  let rawResult: { text: string; tokensIn: number; tokensOut: number; modelKey: string };

  try {
    rawResult = await callLinkedInModel(systemPrompt, userPrompt);
  } catch (error: any) {
    console.error("[LinkedIn] LLM call failed:", error.message);
    return {
      reply: "Failed to generate reply. Please try again.",
      modelKey: getGroqTertiaryModel(),
      latencyMs: Date.now() - startTime,
    };
  }

  const maxWordsOverride = resolveLinkedInMaxWordsOverride(options);
  const processed = replyPostProcessor.processReply(
    rawResult.text,
    options.replyMode,
    maxWordsOverride,
  );

  const qualityTargetText = resolveLinkedInQualityTargetText(
    options.postText,
    options.threadContext,
  );

  const quality = linkedInQualityChecker.checkQuality(processed, qualityTargetText);

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

      const retryHints: string[] = [];
      const selfRefFailed =
        (quality.parameters.find((p) => p.name === "no_self_referential_framing")?.score ?? 20) === 0;
      const hedgingFailed =
        (quality.parameters.find((p) => p.name === "direct_statements")?.score ?? 20) === 0;
      if (isLikelyPostRewrite(processed, qualityTargetText)) {
        retryHints.push(POST_REWRITE_RETRY_HINT);
      }
      if (selfRefFailed) {
        retryHints.push(POST_SELF_REF_RETRY_HINT);
      }
      if (hedgingFailed) {
        retryHints.push(POST_DIRECT_STATEMENT_RETRY_HINT);
      }

      const retryUserPrompt =
        retryHints.length > 0
          ? `${retryUserPromptBase}\n\n${retryHints.join("\n\n")}`
          : retryUserPromptBase;

      const retryResult = await callLinkedInModel(retrySystemPrompt, retryUserPrompt);
      const retryProcessed = replyPostProcessor.processReply(
        retryResult.text,
        options.replyMode,
        maxWordsOverride,
      );
      const retryQuality = linkedInQualityChecker.checkQuality(retryProcessed, qualityTargetText);

      if (shouldAcceptLinkedInRetryQuality(retryQuality, quality)) {
        console.log(
          `[LinkedIn] Retry improved quality (${retryQuality.totalScore} vs ${quality.totalScore})`,
        );
        return {
          reply: retryProcessed,
          modelKey: retryResult.modelKey,
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
    modelKey: rawResult.modelKey,
    tokensIn: rawResult.tokensIn,
    tokensOut: rawResult.tokensOut,
    latencyMs: Date.now() - startTime,
  };
}
