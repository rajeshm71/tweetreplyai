import OpenAI from "openai";
import { getPromptConfig, type PromptConfig } from "./prompts";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

export interface ReplyOptions {
  tweetText: string;
  tweetId?: string;
  modelPreference?: string;
  promptVariation?: string;
}

export interface ReplyResponse {
  reply: string;
  modelKey: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
}

export class ModelRouter {
  // Available OpenAI models with their characteristics
  private readonly MODELS = {
    // GPT-4o Series (Stable models)
    "gpt-4o-mini": {
      name: "gpt-4o-mini",
      inputCost: 0.15, // per 1M tokens
      outputCost: 0.6, // per 1M tokens
      contextWindow: 128000,
      description: "Cost-effective multimodal option",
    },
    "gpt-4o": {
      name: "gpt-4o",
      inputCost: 2.5, // per 1M tokens
      outputCost: 10.0, // per 1M tokens
      contextWindow: 128000,
      description: "Multimodal model with vision capabilities",
    },
    // GPT-5 Series (Latest flagship models)
    "gpt-4.1-mini": {
      name: "gpt-4.1-mini",
      inputCost: 0.4, // per 1M tokens
      outputCost: 1.6, // per 1M tokens
      contextWindow: 272000,
      description: "Better than 4o mini",
    },
    "gpt-5-mini": {
      name: "gpt-5-mini",
      inputCost: 0.25, // per 1M tokens
      outputCost: 2.0, // per 1M tokens
      contextWindow: 272000,
      description: "Smaller, faster, cost-effective GPT-5 version",
    },
    "gpt-5-nano": {
      name: "gpt-5-nano",
      inputCost: 0.05, // per 1M tokens
      outputCost: 0.4, // per 1M tokens
      contextWindow: 272000,
      description: "Ultra-lightweight GPT-5 for simple tasks",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }

    // Default routing logic with stable models
    if (tweetText.length > 280 || this.isComplexTweet(tweetText)) {
      return "gpt-5" in this.MODELS ? "gpt-5" : "gpt-4o";
    }

    return "gpt-4o-mini"; // Cost-effective for simple tweets
  }

  private isComplexTweet(tweetText: string): boolean {
    // Simple heuristic for complexity
    const complexPatterns = [
      /https?:\/\/[^\s]+/g, // URLs
      /@\w+/g, // Mentions
      /#\w+/g, // Hashtags
      /[🎯📊💡🚀⚡️🔥💪]/g, // Complex emojis
    ];

    const matches = complexPatterns.reduce((count, pattern) => {
      return count + (tweetText.match(pattern) || []).length;
    }, 0);

    return matches > 2 || tweetText.split("\n").length > 2;
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
  }

  private postProcessReply(reply: string): string {
    // Trim whitespace and ensure proper length
    let processed = reply.trim();

    // Remove quotes if the AI wrapped the response
    if (processed.startsWith('"') && processed.endsWith('"')) {
      processed = processed.slice(1, -1);
    }

    // Ensure it's under 50 words
    const words = processed.split(/\s+/);
    if (words.length > 50) {
      processed = words.slice(0, 50).join(" ");
    }

    // Remove banned patterns
    const bannedPatterns = [
      /#\w+/g, // Hashtags
      /Check out my/gi,
      /The future is here/gi,
      /This changes everything/gi,
      /Revolutionary/gi,
      /Game-changing/gi,
    ];

    bannedPatterns.forEach((pattern) => {
      processed = processed.replace(pattern, "");
    });

    return processed.trim();
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );
    const promptConfig = this.getPromptConfig(options.promptVariation);

    console.log(`🚀 [OpenAI] Starting request with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${options.tweetText}"`);
    console.log(`🎯 [OpenAI] Using prompt: ${promptConfig.name}`);

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
      // Use responses API only for GPT-5 versions
      if (modelKey.startsWith("gpt-5") || modelKey.startsWith("gpt-4o")) {
        const response = await openai.responses.create({
          model: modelKey,
          input: [
            { role: "system", content: promptConfig.systemPrompt },
            { role: "user", content: promptConfig.userPrompt(options.tweetText) },
          ],
          top_p: 1,
          temperature: 0.7,
          //max_output_tokens: 1000,
        });
        console.log(`📝 [OpenAI] Response received:`, response);
        const rawReply = response.output_text || "";
        const processedReply = this.postProcessReply(rawReply);
        const latencyMs = Date.now() - startTime;

        return {
          reply: processedReply,
          modelKey,
          tokensIn: response.usage?.input_tokens,
          tokensOut: response.usage?.output_tokens,
          latencyMs,
        };
      } else {
        // Use chat completions API for GPT-4 models
        console.log(
          `🚀 [OpenAI] Using chat completions for model: ${modelKey}`,
        );
        const response = await openai.chat.completions.create({
          model: modelKey,
          messages: [
            { role: "system", content: promptConfig.systemPrompt },
            { role: "user", content: promptConfig.userPrompt(options.tweetText) },
          ],
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
        });
        console.log(`📝 [OpenAI] Response received:`, response);
        const rawReply = response.choices[0]?.message?.content || "";
        const processedReply = this.postProcessReply(rawReply);
        const latencyMs = Date.now() - startTime;

        return {
          reply: processedReply,
          modelKey,
          tokensIn: response.usage?.prompt_tokens,
          tokensOut: response.usage?.completion_tokens,
          latencyMs,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`❌ [OpenAI] Error generating reply: ${message}`);
      console.error(`🔧 [OpenAI] Model used: ${modelKey}`);
      console.error(`🔧 [OpenAI] Full error:`, error);
      throw new Error(`Failed to generate reply: ${message}`);
    }
  }

  // Get model information for UI display
  getModelInfo(modelKey: string) {
    return this.MODELS[modelKey as keyof typeof this.MODELS] || null;
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
