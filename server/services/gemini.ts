import { GoogleGenAI } from "@google/genai";
import { ReplyOptions, ReplyResponse } from "./openai.js";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { buildSystemPrompt, buildUserPromptWithThread } from "./prompt-builder.js";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export class GeminiModelRouter {
  private readonly MODELS = {
    "gemini-2.5-pro": {
      name: "gemini-2.5-pro",
      inputCost: 1.25,
      outputCost: 10,
      contextWindow: 1048576,
      description:
        "Enhanced thinking and reasoning, multimodal understanding, advanced coding",
    },
    "gemini-2.5-flash": {
      name: "gemini-2.5-flash",
      inputCost: 0.3,
      outputCost: 2.5,
      contextWindow: 1048576,
      description: "Best price performance ratio, well-rounded capabilities",
    },
    "gemini-2.5-flash-lite": {
      name: "gemini-2.5-flash-lite",
      inputCost: 0.1,
      outputCost: 0.4,
      contextWindow: 1048576,
      description: "Most cost efficient model supporting high throughput",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }

    if (tweetText.length > 280 || this.isComplexTweet(tweetText)) {
      return "gemini-2.5-flash";
    }

    return "gemini-2.5-flash-lite";
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
  }

  private isComplexTweet(tweetText: string): boolean {
    const complexPatterns = [
      /https?:\/\/[^\s]+/g,
      /@\w+/g,
      /#\w+/g,
      /[🎯📊💡🚀⚡️🔥💪]/g,
    ];

    const matches = complexPatterns.reduce((count, pattern) => {
      return count + (tweetText.match(pattern) || []).length;
    }, 0);

    return matches > 2 || tweetText.split("\n").length > 2;
  }

  private postProcessReply(reply: string, replyMode?: string): string {
    return replyPostProcessor.processReply(reply, replyMode);
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );
    const basePromptConfig = this.getPromptConfig(options.promptVariation);
    const promptConfig = applyReplyModeToPrompt(basePromptConfig, options.replyMode);

    if (!genAI) {
      return {
        reply:
          "Thanks for sharing! This is a demo reply since Gemini isn't configured yet.",
        modelKey: "demo-gemini",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const enhancedSystemPrompt = await buildSystemPrompt({
        baseSystemPrompt: promptConfig.systemPrompt,
        tweetAnalysis: options.tweetAnalysis,
        tweetContext: options.tweetContext,
        authorInfo: options.authorInfo,
        threadContext: options.threadContext,
      });

      const userPromptText = buildUserPromptWithThread(
        promptConfig.userPrompt(options.tweetText),
        options.threadContext
      );

      // Log full prompts used for generate-reply
      console.log('[PROMPT] [Gemini] generate-reply', {
        replyMode: options.replyMode,
        modelKey,
        promptVariation: options.promptVariation,
        systemPromptLength: enhancedSystemPrompt.length,
        userPromptLength: userPromptText.length,
      });
      console.log('[PROMPT] [Gemini] system:', enhancedSystemPrompt);
      console.log('[PROMPT] [Gemini] user:', userPromptText);

      const fullPrompt = `${enhancedSystemPrompt}\n\n${userPromptText}`;

      const response = await genAI.models.generateContent({
        model: modelKey,
        contents: fullPrompt,
        config: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });
      const rawReply = response.text || "";
      const processedReply = this.postProcessReply(rawReply, options.replyMode);
      const latencyMs = Date.now() - startTime;

      const estimatedInputTokens =
        response.usageMetadata?.promptTokenCount ||
        Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens =
        response.usageMetadata?.candidatesTokenCount ||
        Math.ceil(processedReply.length / 4);

      return {
        reply: processedReply,
        modelKey,
        tokensIn: estimatedInputTokens,
        tokensOut: estimatedOutputTokens,
        latencyMs,
      };
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Unknown error";
      console.error(`[Gemini] Error generating reply: ${message}`);
      throw new Error(`Failed to generate reply with Gemini: ${message}`);
    }
  }

  getAvailableModels() {
    return Object.entries(this.MODELS).map(([key, info]) => ({
      key,
      ...info,
      provider: "gemini",
    }));
  }
}

export const geminiModelRouter = new GeminiModelRouter();
