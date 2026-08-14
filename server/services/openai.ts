import OpenAI from "openai";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { getOriginalAuthorPromptConfig } from "./prompts-original-author.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { buildSystemPrompt, buildUserPromptWithThread } from "./prompt-builder.js";
import { getDynamicReplyMaxWords, getDynamicReplyWordRange } from "./oa-dynamic-reply-length.js";
import type { EnrichedTweetAnalysis } from "./tweet-analysis-agents.js";
import { AI_MODELS, AI_PARAMS, MODEL_SPECS, REPLY_LIMITS } from "../config/constants.js";
import { getApiProfile, getCatalogModel, getModelCatalog } from "../config/model-catalog.js";
import type { ModelApiProfile } from "../config/model-catalog.js";
import { getModelRoutingConfig, isModelRoutingEnabled } from "../config/model-routing.js";
import { getReframePromptConfig, type ReframePromptOptions } from "./reframe-prompts.js";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

/** Review fix: surface invalid_model / 404 clearly for tier model ID tuning (plan §4). */
function logOpenAIModelError(operation: string, modelKey: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number })?.status;
  const code = (error as { code?: string })?.code;
  console.error(`❌ [OpenAI] Error during ${operation}: ${message}`);
  console.error(`🔧 [OpenAI] Model used: ${modelKey}`);
  if (status === 404 || code === "invalid_model" || /model|404/i.test(message)) {
    console.error(
      "[OpenAI] Model ID may be invalid for this API account — verify MODEL_ROUTING_TIER1_MODEL / TIER2_MODEL",
    );
  }
  console.error(`🔧 [OpenAI] Full error:`, error);
}

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
  tierId?: string;
  rawUsage?: Record<string, unknown>;
}

export class ModelRouter {
  private readonly MODELS = {
    [AI_MODELS.FALLBACK]: {
      name: "GPT-5.4 Mini",
      ...MODEL_SPECS.GPT_5_4_MINI,
      description: "Secondary cascade tier — cost-efficient GPT-5.4 mini",
    },
    "gpt-5-chat-latest": {
      name: "GPT-5 Chat Latest",
      ...MODEL_SPECS.GPT_5_CHAT_LATEST,
      description: "Primary cascade tier — latest GPT-5 chat model",
    },
    "gpt-5.4-mini": {
      name: "GPT-5.4 Mini",
      ...MODEL_SPECS.GPT_5_4_MINI,
      description: "Secondary cascade tier — cost-efficient GPT-5.4 mini",
    },
    "gpt-4o-mini": {
      name: "GPT-4o Mini (legacy)",
      ...MODEL_SPECS.GPT_4O_MINI,
      description: "Legacy fallback alias mapped to cascade routing",
    },
  } as const;

  private getModel(modelPreference?: string): string {
    if (modelPreference) {
      if (modelPreference in this.MODELS) {
        return modelPreference;
      }
      if (getCatalogModel(modelPreference)?.provider === "openai") {
        return modelPreference;
      }
      if (modelPreference.startsWith("gpt-")) {
        return modelPreference;
      }
      const tierMatch = getModelRoutingConfig().find((t) => t.model === modelPreference);
      if (tierMatch?.provider === "openai") {
        return tierMatch.model;
      }
    }
    return isModelRoutingEnabled() ? getModelRoutingConfig().find((t) => t.id === "primary")?.model ?? AI_MODELS.FALLBACK : AI_MODELS.FALLBACK;
  }

  private async runCompletion(
    modelKey: string,
    systemPrompt: string,
    userPrompt: string,
    profileOverride?: ModelApiProfile,
    maxTokens?: number,
  ): Promise<{ text: string; tokensIn?: number; tokensOut?: number; rawUsage?: Record<string, unknown> }> {
    if (!openai) {
      throw new Error("OpenAI client not configured");
    }

    const profile = profileOverride ?? getApiProfile(modelKey);
    const tokenLimit = maxTokens ?? AI_PARAMS.GROQ_MAX_TOKENS;

    if (profile === "responses_chat") {
      const response = await openai.responses.create({
        model: modelKey,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        top_p: 1,
        temperature: AI_PARAMS.TEMPERATURE,
        max_output_tokens: tokenLimit,
      });
      const usage = response.usage as Record<string, unknown> | undefined;
      return {
        text: response.output_text || "",
        tokensIn: response.usage?.input_tokens,
        tokensOut: response.usage?.output_tokens,
        rawUsage: usage,
      };
    }

    const isReasoning = profile === "chat_reasoning";
    const response = await openai.chat.completions.create({
      model: modelKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(isReasoning
        ? { max_completion_tokens: tokenLimit }
        : { temperature: AI_PARAMS.TEMPERATURE, max_tokens: tokenLimit }),
    });

    const choice = response.choices[0]?.message?.content ?? "";
    const usage = response.usage as Record<string, unknown> | undefined;
    return {
      text: typeof choice === "string" ? choice : "",
      tokensIn: response.usage?.prompt_tokens,
      tokensOut: response.usage?.completion_tokens,
      rawUsage: usage,
    };
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
      if (isModelRoutingEnabled()) {
        throw new Error("OpenAI client not configured");
      }
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

      const completion = await this.runCompletion(modelKey, enhancedSystemPrompt, userPromptText);
      const processedReply = this.postProcessReply(completion.text, false, options.replyMode, replyMaxWordsOverride);
      const latencyMs = Date.now() - startTime;

      return {
        reply: processedReply,
        modelKey,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        latencyMs,
        rawUsage: completion.rawUsage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logOpenAIModelError("generateReply", modelKey, error);
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
      if (isModelRoutingEnabled()) {
        throw new Error("OpenAI client not configured");
      }
      return {
        reply: draftReply,
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const completion = await this.runCompletion(modelKey, promptConfig.systemPrompt, userPrompt);
      const rawReply = completion.text;
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
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        latencyMs,
        rawUsage: completion.rawUsage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logOpenAIModelError("improveDraft", modelKey, error);
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
      reuseGuidance: opts.reuseGuidance,
    });

    console.log(`🚀 [OpenAI] Reframe start — model: ${modelKey}, degree: ${config.degree} (${config.band})`);

    if (!openai) {
      console.log("❌ [OpenAI] OpenAI client not configured (demo mode)");
      if (isModelRoutingEnabled()) {
        throw new Error("OpenAI client not configured");
      }
      return {
        reply: source,
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const completion = await this.runCompletion(
        modelKey,
        config.systemPrompt,
        config.userPrompt(source),
        undefined,
        opts.allowLong ? AI_PARAMS.REFRAME_LONG_MAX_TOKENS : undefined,
      );

      const processedReply = replyPostProcessor.processReframe(completion.text);

      if (processedReply.trim().toLowerCase() === source.trim().toLowerCase()) {
        console.warn(`⚠️ [OpenAI] Reframe output identical to source at degree ${config.degree}`);
      }

      const latencyMs = Date.now() - startTime;
      return {
        reply: processedReply,
        modelKey,
        tokensIn: completion.tokensIn,
        tokensOut: completion.tokensOut,
        latencyMs,
        rawUsage: completion.rawUsage,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logOpenAIModelError("reframeTweet", modelKey, error);
      throw new Error(`Failed to reframe tweet: ${message}`);
    }
  }

  async generateChatCompletion(
    systemPrompt: string,
    userPrompt: string,
    modelPreference?: string,
  ): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModel(modelPreference);

    if (!openai) {
      if (isModelRoutingEnabled()) {
        throw new Error("OpenAI client not configured");
      }
      return {
        reply: "Demo chat completion — OpenAI not configured.",
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    const completion = await this.runCompletion(modelKey, systemPrompt, userPrompt);
    return {
      reply: completion.text,
      modelKey,
      tokensIn: completion.tokensIn,
      tokensOut: completion.tokensOut,
      latencyMs: Date.now() - startTime,
      rawUsage: completion.rawUsage,
    };
  }

  // Get all available OpenAI models
  getAvailableModels() {
    const seen = new Set<string>();
    const models: Array<{ key: string; name: string; inputCost: number; outputCost: number; contextWindow: number; description: string; provider: string }> = [];

    for (const [key, info] of Object.entries(this.MODELS)) {
      if (seen.has(key)) continue;
      seen.add(key);
      models.push({ key, ...info, provider: "openai" });
    }

    for (const entry of getModelCatalog()) {
      if (entry.provider !== "openai" || seen.has(entry.key)) continue;
      seen.add(entry.key);
      models.push({
        key: entry.key,
        name: entry.name,
        inputCost: entry.inputCost,
        outputCost: entry.outputCost,
        contextWindow: entry.contextWindow,
        description: entry.description,
        provider: "openai",
      });
    }

    if (isModelRoutingEnabled()) {
      for (const tier of getModelRoutingConfig()) {
        if (tier.provider !== "openai" || seen.has(tier.model)) continue;
        seen.add(tier.model);
        const spec = tier.model.includes("mini") ? MODEL_SPECS.GPT_5_4_MINI : MODEL_SPECS.GPT_5_CHAT_LATEST;
        models.push({
          key: tier.model,
          name: tier.model,
          ...spec,
          description: `Configured ${tier.id} cascade tier`,
          provider: "openai",
        });
      }
    }

    return models;
  }
}

export const modelRouter = new ModelRouter();
