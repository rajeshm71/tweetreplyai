import OpenAI from "openai";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { getOriginalAuthorPromptConfig } from "./prompts-original-author.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { buildSystemPrompt, buildUserPromptWithThread } from "./prompt-builder.js";
import { getDynamicReplyMaxWords, getDynamicReplyWordRange } from "./oa-dynamic-reply-length.js";
import type { EnrichedTweetAnalysis } from "./tweet-analysis-agents.js";
import { AI_MODELS, AI_PARAMS, MODEL_SPECS, REPLY_LIMITS } from "../config/constants.js";
import { getReframePromptConfig, type ReframePromptOptions } from "./reframe-prompts.js";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

export interface ReplyOptions {
  tweetText: string;
  tweetId?: string;
  modelPreference?: string;
  promptVariation?: string;
  replyMode?: string; // Reply mode: 'single-sentence' | 'enhanced'
  tweetContext?: any; // Will be imported from tweet-context.ts
  tweetAnalysis?: EnrichedTweetAnalysis; // AI-powered tweet analysis from agents
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
  tweetMetadata?: {
    has_media?: boolean;
    has_poll?: boolean;
    timestamp?: string;
  };
  viewerIsOriginalAuthor?: boolean;
  // Optional handles used only for internal role disambiguation in prompts.
  replyAuthorHandle?: string;
  targetAuthorHandle?: string;
  // Backward-compatibility field, currently unused by prompt builder but passed from routes.
  conversationContext?: any;
}

export interface ReplyResponse {
  reply: string;
  modelKey: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

export class ModelRouter {
  private readonly MODELS = {
    [AI_MODELS.FALLBACK]: {
      name: "Standard",
      ...MODEL_SPECS.GPT_4O_MINI,
      description: "Reliable general-purpose model",
    },
  } as const;

  private getModel(modelPreference?: string): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }
    return AI_MODELS.FALLBACK;
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
  }

  private postProcessReply(reply: string, isImprovedDraft: boolean = false, replyMode?: string, maxWordsOverride?: number): string {
    if (isImprovedDraft) {
      return replyPostProcessor.processReplyLight(reply, maxWordsOverride);
    }
    return replyPostProcessor.processReply(reply, replyMode, maxWordsOverride);
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModel(options.modelPreference);
    const basePromptConfig = options.viewerIsOriginalAuthor
      ? getOriginalAuthorPromptConfig(options.promptVariation)
      : this.getPromptConfig(options.promptVariation);

    const promptConfig = applyReplyModeToPrompt(basePromptConfig, options.replyMode);

    // OA dynamic reply length: derive max words and range from comment (tweet being replied to)
    let replyMaxWordsOverride: number | undefined;
    let replyWordRange: { min: number; max: number } | undefined;
    if (options.viewerIsOriginalAuthor && options.tweetText?.trim()) {
      const max = getDynamicReplyMaxWords(options.tweetText);
      const range = getDynamicReplyWordRange(options.tweetText);
      if (max > 0 && range) {
        replyMaxWordsOverride = max;
        replyWordRange = range;
      }
    }

    const enhancedSystemPrompt = await buildSystemPrompt({
      baseSystemPrompt: promptConfig.systemPrompt,
      tweetAnalysis: options.tweetAnalysis,
      tweetContext: options.tweetContext,
      authorInfo: options.authorInfo,
      threadContext: options.threadContext,
      viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
      replyAuthorHandle: options.replyAuthorHandle,
      targetAuthorHandle: options.targetAuthorHandle,
      replyMaxWordsOverride,
      replyWordRange,
    });

    if (!openai) {
      console.log("❌ [OpenAI] OpenAI client not configured");
      return {
        reply:
          "Thanks for sharing! This is a demo reply since OpenAI isn't configured yet.",
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const userPromptText = buildUserPromptWithThread(
        promptConfig.userPrompt(options.tweetText),
        options.threadContext,
        { replyAuthorHandle: options.replyAuthorHandle, targetAuthorHandle: options.targetAuthorHandle },
        options.viewerIsOriginalAuthor
      );

      console.log('[PROMPT] [OpenAI] generate-reply', {
        replyMode: options.replyMode,
        modelKey,
        promptVariation: options.promptVariation,
        systemPromptLength: enhancedSystemPrompt.length,
        userPromptLength: userPromptText.length,
      });
      console.log('[PROMPT] [OpenAI] system:', enhancedSystemPrompt);
      console.log('[PROMPT] [OpenAI] user:', userPromptText);

      const response = await openai.responses.create({
        model: modelKey,
        input: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: userPromptText },
        ],
        top_p: 1,
        temperature: AI_PARAMS.TEMPERATURE,
      });
      const rawReply = response.output_text || "";
      const processedReply = this.postProcessReply(rawReply, false, options.replyMode, replyMaxWordsOverride);
      const latencyMs = Date.now() - startTime;

      return {
        reply: processedReply,
        modelKey,
        tokensIn: response.usage?.input_tokens,
        tokensOut: response.usage?.output_tokens,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [OpenAI] Error generating reply: ${message}`);
      console.error(`🔧 [OpenAI] Model used: ${modelKey}`);
      console.error(`🔧 [OpenAI] Full error:`, error);
      throw new Error(`Failed to generate reply: ${message}`);
    }
  }

  async improveDraft(tweetText: string, draftReply: string, modelPreference?: string): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModel(modelPreference);
    const promptConfig = this.getPromptConfig('improve');

    console.log(`🚀 [OpenAI] Starting improvement with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${tweetText}"`);
    console.log(`📝 [OpenAI] Draft reply: "${draftReply}"`);

    const userPrompt = `Tweet: "${tweetText}"

User's draft idea: "${draftReply}"

Write a clean, natural reply based on the user's draft idea. Keep it under ${REPLY_LIMITS.MAX_WORDS} words.`;

    if (!openai) {
      console.log("❌ [OpenAI] OpenAI client not configured");
      return {
        reply: draftReply,
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const response = await openai.responses.create({
        model: modelKey,
        input: [
          { role: "system", content: promptConfig.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        top_p: 1,
        temperature: AI_PARAMS.TEMPERATURE,
      });
      const rawReply = response.output_text || "";
      console.log(`🔍 [OpenAI] Raw AI response before post-processing: "${rawReply}"`);
      const processedReply = this.postProcessReply(rawReply, true);
      console.log(`✨ [OpenAI] Post-processed improved reply: "${processedReply}"`);
      
      const originalNormalized = draftReply.trim().toLowerCase();
      const improvedNormalized = processedReply.trim().toLowerCase();
      if (originalNormalized === improvedNormalized) {
        console.warn(`⚠️ [OpenAI] Improved version is identical to original draft! Original: "${draftReply}", Improved: "${processedReply}"`);
      }
      
      const latencyMs = Date.now() - startTime;

      return {
        reply: processedReply,
        modelKey,
        tokensIn: response.usage?.input_tokens,
        tokensOut: response.usage?.output_tokens,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [OpenAI] Error improving draft: ${message}`);
      console.error(`🔧 [OpenAI] Model used: ${modelKey}`);
      console.error(`🔧 [OpenAI] Full error:`, error);
      throw new Error(`Failed to improve draft: ${message}`);
    }
  }

  /**
   * Reframe a source tweet into a new standalone tweet at the given degree-of-change.
   * Mirrors `improveDraft` in shape: takes plain strings in, returns a ReplyResponse,
   * and falls through to a no-op when the client is not configured (demo mode).
   */
  async reframeTweet(
    source: string,
    degree: number,
    opts: ReframePromptOptions & { modelPreference?: string } = {},
  ): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModel(opts.modelPreference);
    const config = getReframePromptConfig(degree, {
      allowLong: opts.allowLong,
      retryBoost: opts.retryBoost,
    });

    console.log(`🚀 [OpenAI] Reframe start — model: ${modelKey}, degree: ${config.degree} (${config.band})`);

    if (!openai) {
      console.log("❌ [OpenAI] OpenAI client not configured (demo mode)");
      return {
        reply: source,
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const response = await openai.responses.create({
        model: modelKey,
        input: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: config.userPrompt(source) },
        ],
        top_p: 1,
        temperature: AI_PARAMS.TEMPERATURE,
      });

      const rawReply = response.output_text || "";
      const processedReply = replyPostProcessor.processReframe(rawReply);

      if (processedReply.trim().toLowerCase() === source.trim().toLowerCase()) {
        console.warn(`⚠️ [OpenAI] Reframe output identical to source at degree ${config.degree}`);
      }

      const latencyMs = Date.now() - startTime;
      return {
        reply: processedReply,
        modelKey,
        tokensIn: response.usage?.input_tokens,
        tokensOut: response.usage?.output_tokens,
        latencyMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [OpenAI] Error reframing tweet: ${message}`);
      throw new Error(`Failed to reframe tweet: ${message}`);
    }
  }

  // Get all available OpenAI models
  getAvailableModels() {
    return Object.entries(this.MODELS).map(([key, info]) => ({
      key,
      ...info,
      provider: "openai",
    }));
  }
}

export const modelRouter = new ModelRouter();
