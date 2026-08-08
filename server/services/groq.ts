import { Groq } from "groq-sdk";
import { ReplyOptions, ReplyResponse } from "./openai.js";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { getOriginalAuthorPromptConfig } from "./prompts-original-author.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { buildSystemPrompt, buildUserPromptWithThread } from "./prompt-builder.js";
import { getDynamicReplyMaxWords, getDynamicReplyWordRange } from "./oa-dynamic-reply-length.js";
import { AI_MODELS, AI_PARAMS, MODEL_SPECS, REPLY_LIMITS } from "../config/constants.js";
import { getGroqTertiaryModel, isModelRoutingEnabled } from "../config/model-routing.js";
import { getReframePromptConfig, type ReframePromptOptions } from "./reframe-prompts.js";

// Initialize Groq client
const groq = process.env.GROQ_API_KEY ? new Groq() : null;

export class GroqModelRouter {
  private readonly MODELS = {
    [getGroqTertiaryModel()]: {
      name: "GPT-OSS 120B (tertiary)",
      ...MODEL_SPECS.GPT_OSS_120B,
      description: "Tertiary cascade tier — OpenAI open-weight model on Groq",
    },
  } as const;

  private isAllowedGroqModel(modelPreference?: string): boolean {
    if (!modelPreference) return false;
    return (
      modelPreference in this.MODELS ||
      modelPreference.startsWith("openai/") ||
      modelPreference.startsWith("meta-llama/") ||
      modelPreference.startsWith("llama-")
    );
  }

  private getModelForTweet(
    _tweetText: string,
    modelPreference?: string,
  ): string {
    const tertiary = getGroqTertiaryModel();
    if (this.isAllowedGroqModel(modelPreference)) {
      return modelPreference!;
    }
    return tertiary;
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
  }

  private postProcessReply(reply: string, replyMode?: string, maxWordsOverride?: number): string {
    return replyPostProcessor.processReply(reply, replyMode, maxWordsOverride);
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );
    const basePromptConfig = options.viewerIsOriginalAuthor
      ? getOriginalAuthorPromptConfig(options.promptVariation)
      : this.getPromptConfig(options.promptVariation);

    // Apply reply mode modifications to prompt
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

    if (!groq) {
      console.log(`❌ [Groq] Groq client not configured`);
      if (isModelRoutingEnabled()) {
        throw new Error("Groq client not configured");
      }
      return {
        reply:
          "Thanks for sharing! This is a demo reply since Groq isn't configured yet.",
        modelKey: "demo-groq",
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

      // Log full prompts used for generate-reply
      console.log('[PROMPT] [Groq] generate-reply', {
        replyMode: options.replyMode,
        modelKey,
        promptVariation: options.promptVariation,
        systemPromptLength: enhancedSystemPrompt.length,
        userPromptLength: userPromptText.length,
      });
      console.log('[PROMPT] [Groq] system:', enhancedSystemPrompt);
      console.log('[PROMPT] [Groq] user:', userPromptText);

      const messages = [
        { role: "system" as const, content: enhancedSystemPrompt },
        { role: "user" as const, content: userPromptText },
      ];
      const groqRequestBody = {
        messages,
        model: modelKey,
        temperature: AI_PARAMS.TEMPERATURE,
        max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
        top_p: 1,
        stream: false,
        stop: null,
      };
      console.log('[GROQ] Exact request sent to Groq (message count = ' + messages.length + '):', JSON.stringify(groqRequestBody, null, 2));

      // Review fix: non-streaming so usage metadata is available for budget/analytics.
      const chatCompletion = await groq.chat.completions.create({
        messages,
        model: modelKey,
        temperature: AI_PARAMS.TEMPERATURE,
        max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
        top_p: 1,
        stream: false,
        stop: null,
      });

      const fullReply = chatCompletion.choices[0]?.message?.content ?? '';
      const processedReply = this.postProcessReply(fullReply, options.replyMode, replyMaxWordsOverride);
      const latencyMs = Date.now() - startTime;

      const usage = chatCompletion.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
      const estimatedInputTokens = Math.ceil((enhancedSystemPrompt + userPromptText).length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);
      const estimatedOutputTokens = Math.ceil(processedReply.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);

      return {
        reply: processedReply,
        modelKey,
        tokensIn: usage?.prompt_tokens ?? estimatedInputTokens,
        tokensOut: usage?.completion_tokens ?? estimatedOutputTokens,
        latencyMs,
        rawUsage: usage as Record<string, unknown> | undefined,
      };
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Unknown error";
      console.error(`❌ [Groq] Error generating reply: ${message}`);
      console.error(`🔧 [Groq] Model used: ${modelKey}`);
      console.error(`🔧 [Groq] Full error:`, error);
      throw new Error(`Failed to generate reply with Groq: ${message}`);
    }
  }

  async improveDraft(tweetText: string, draftReply: string, modelPreference?: string): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.isAllowedGroqModel(modelPreference)
      ? modelPreference!
      : getGroqTertiaryModel();
    const promptConfig = this.getPromptConfig("improve");

    console.log(`🚀 [Groq] Starting improvement with model: ${modelKey}`);
    console.log(`📝 [Groq] Tweet text: "${tweetText.substring(0, 50)}..."`);
    console.log(`📝 [Groq] Draft reply: "${draftReply.substring(0, 50)}..."`);

    const userPrompt = `Tweet: "${tweetText}"

User's draft idea: "${draftReply}"

Write a clean, natural reply based on the user's draft idea. Keep it under ${REPLY_LIMITS.MAX_WORDS} words.`;

    if (!groq) {
      console.log("❌ [Groq] Groq client not configured");
      if (isModelRoutingEnabled()) {
        throw new Error("Groq client not configured");
      }
      return {
        reply: draftReply,
        modelKey: "demo-groq",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const response = await groq.chat.completions.create({
        messages: [
          { role: "system", content: promptConfig.systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelKey,
        temperature: AI_PARAMS.TEMPERATURE,
        max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
        top_p: 1,
      });
      const rawReply = response.choices[0]?.message?.content ?? "";
      console.log(`🔍 [Groq] Raw AI response before post-processing: "${rawReply.substring(0, 80)}..."`);
      const processedReply = replyPostProcessor.processReplyLight(rawReply);
      console.log(`✨ [Groq] Post-processed improved reply: "${processedReply.substring(0, 80)}..."`);

      const latencyMs = Date.now() - startTime;
      const estimatedInputTokens = Math.ceil((promptConfig.systemPrompt + userPrompt).length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);
      const estimatedOutputTokens = Math.ceil(processedReply.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);

      const usage = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      return {
        reply: processedReply,
        modelKey,
        tokensIn: usage?.prompt_tokens ?? estimatedInputTokens,
        tokensOut: usage?.completion_tokens ?? estimatedOutputTokens,
        latencyMs,
        rawUsage: usage as Record<string, unknown> | undefined,
      };
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Unknown error";
      console.error(`❌ [Groq] Error improving draft: ${message}`);
      console.error(`🔧 [Groq] Model used: ${modelKey}`);
      throw new Error(`Failed to improve draft with Groq: ${message}`);
    }
  }

  /**
   * Reframe a source tweet into a new standalone tweet at the given degree-of-change.
   * Mirrors `improveDraft` in shape and degrades to a demo response when the Groq
   * client is not configured.
   */
  async reframeTweet(
    source: string,
    degree: number,
    opts: ReframePromptOptions & { modelPreference?: string } = {},
  ): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.isAllowedGroqModel(opts.modelPreference)
      ? opts.modelPreference!
      : getGroqTertiaryModel();
    const config = getReframePromptConfig(degree, {
      allowLong: opts.allowLong,
      retryBoost: opts.retryBoost,
      reuseGuidance: opts.reuseGuidance,
    });

    console.log(`🚀 [Groq] Reframe start — model: ${modelKey}, degree: ${config.degree} (${config.band})`);

    if (!groq) {
      console.log("❌ [Groq] Groq client not configured (demo mode)");
      if (isModelRoutingEnabled()) {
        throw new Error("Groq client not configured");
      }
      return {
        reply: source,
        modelKey: "demo-groq",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const response = await groq.chat.completions.create({
        messages: [
          { role: "system", content: config.systemPrompt },
          { role: "user", content: config.userPrompt(source) },
        ],
        model: modelKey,
        temperature: AI_PARAMS.TEMPERATURE,
        max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
        top_p: 1,
      });

      const rawReply = response.choices[0]?.message?.content ?? "";
      const processedReply = replyPostProcessor.processReframe(rawReply);

      const latencyMs = Date.now() - startTime;
      const estimatedInputTokens = Math.ceil((config.systemPrompt + source).length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);
      const estimatedOutputTokens = Math.ceil(processedReply.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);

      const usage = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      return {
        reply: processedReply,
        modelKey,
        tokensIn: usage?.prompt_tokens ?? estimatedInputTokens,
        tokensOut: usage?.completion_tokens ?? estimatedOutputTokens,
        latencyMs,
        rawUsage: usage as Record<string, unknown> | undefined,
      };
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Unknown error";
      console.error(`❌ [Groq] Error reframing tweet: ${message}`);
      throw new Error(`Failed to reframe tweet with Groq: ${message}`);
    }
  }

  async generateChatCompletion(
    systemPrompt: string,
    userPrompt: string,
    modelPreference?: string,
  ): Promise<import("./openai.js").ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.isAllowedGroqModel(modelPreference)
      ? modelPreference!
      : getGroqTertiaryModel();

    if (!groq) {
      if (isModelRoutingEnabled()) {
        throw new Error("Groq client not configured");
      }
      return {
        reply: "Demo chat completion — Groq not configured.",
        modelKey: "demo-groq",
        latencyMs: Date.now() - startTime,
      };
    }

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: modelKey,
      temperature: AI_PARAMS.TEMPERATURE,
      max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
      top_p: 1,
    });

    const usage = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    return {
      reply: response.choices[0]?.message?.content ?? "",
      modelKey,
      tokensIn: usage?.prompt_tokens,
      tokensOut: usage?.completion_tokens,
      latencyMs: Date.now() - startTime,
      rawUsage: usage as Record<string, unknown> | undefined,
    };
  }

  // Get all available models
  getAvailableModels() {
    const tertiary = getGroqTertiaryModel();
    const entries = Object.entries(this.MODELS);
    if (!entries.some(([key]) => key === tertiary)) {
      entries.push([
        tertiary,
        {
          name: "GPT-OSS 120B (tertiary)",
          ...MODEL_SPECS.GPT_OSS_120B,
          description: "Tertiary cascade tier — OpenAI open-weight model on Groq",
        },
      ]);
    }
    return entries.map(([key, info]) => ({
      key,
      ...info,
      provider: "groq",
    }));
  }
}

export const groqModelRouter = new GroqModelRouter();
