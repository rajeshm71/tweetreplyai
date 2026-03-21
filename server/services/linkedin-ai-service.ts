import { Groq } from "groq-sdk";
import { AI_MODELS, AI_PARAMS } from "../config/constants.js";
import { linkedInAnalysisAgents } from "./linkedin-analysis-agents.js";
import {
  buildLinkedInSystemPrompt,
  buildLinkedInUserPrompt,
  type LinkedInThreadContext,
} from "./linkedin-prompt-builder.js";
import { getLinkedInPromptConfig } from "./prompts-linkedin.js";
import { getLinkedInOriginalAuthorPromptConfig } from "./prompts-linkedin-original-author.js";
import { linkedInPostProcessor } from "./linkedin-postprocessor.js";
import { linkedInQualityChecker } from "./linkedin-quality-checker.js";

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
  viewerIsOriginalAuthor?: boolean;
  authorInfo?: {
    username?: string;
    verified?: boolean;
    follower_count?: number;
  };
  threadContext?: LinkedInThreadContext;
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

  const analysis = await linkedInAnalysisAgents.analyzePost(options.postText);

  const baseConfig = options.viewerIsOriginalAuthor
    ? getLinkedInOriginalAuthorPromptConfig(options.promptVariation)
    : getLinkedInPromptConfig(options.promptVariation);

  const systemPrompt = buildLinkedInSystemPrompt({
    baseConfig,
    analysis,
    postText: options.postText,
    viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
    threadContext: options.threadContext,
  });

  const userPrompt = buildLinkedInUserPrompt({
    baseConfig,
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

  const processed = linkedInPostProcessor.processReply(rawResult.text);

  const quality = linkedInQualityChecker.checkQuality(processed, options.postText);

  if (!quality.passed) {
    console.log(`[LinkedIn] Quality check failed (score: ${quality.totalScore}), retrying...`);

    try {
      const retryVariation = options.promptVariation === "default" ? "direct" : "default";
      const retryConfig = options.viewerIsOriginalAuthor
        ? getLinkedInOriginalAuthorPromptConfig(retryVariation)
        : getLinkedInPromptConfig(retryVariation);

      const retrySystemPrompt = buildLinkedInSystemPrompt({
        baseConfig: retryConfig,
        analysis,
        postText: options.postText,
        viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
        threadContext: options.threadContext,
      });

      const retryUserPrompt = buildLinkedInUserPrompt({
        baseConfig: retryConfig,
        postText: options.postText,
        viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
        threadContext: options.threadContext,
      });

      const retryResult = await callGroq(retrySystemPrompt, retryUserPrompt);
      const retryProcessed = linkedInPostProcessor.processReply(retryResult.text);
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
