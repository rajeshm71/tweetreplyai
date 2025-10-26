import { Groq } from "groq-sdk";
import { ReplyOptions, ReplyResponse } from "./openai.js";
import { getPromptConfig, type PromptConfig } from "./prompts.js";

// Initialize Groq client
const groq = process.env.GROQ_API_KEY ? new Groq() : null;

export class GroqModelRouter {
  // Available Groq models with their characteristics
  private readonly MODELS = {
    "meta-llama/llama-4-scout-17b-16e-instruct": {
      name: "Llama 4 Scout 17B",
      inputCost: 0.1, // per 1M tokens (estimated - Groq typically very competitive)
      outputCost: 0.4, // per 1M tokens (estimated)
      contextWindow: 16384, // 16k extended context
      description: "Latest Llama 4 Scout model with enhanced reasoning and instruction following",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }

    // Default to the single available model for now
    return "meta-llama/llama-4-scout-17b-16e-instruct";
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
  }

  private isComplexTweet(tweetText: string): boolean {
    // Same complexity detection as OpenAI and Gemini services
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

  private postProcessReply(reply: string): string {
    // Same post-processing as OpenAI and Gemini services
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

    console.log(`🚀 [Groq] Starting request with model: ${modelKey}`);
    console.log(`📝 [Groq] Tweet text: "${options.tweetText}"`);
    console.log(`🎯 [Groq] Using prompt: ${promptConfig.name}`);

    // Generate context-aware prompt if context is available
    let enhancedSystemPrompt = promptConfig.systemPrompt;
    if (options.tweetContext) {
      const { tweetContextAnalyzer } = await import('./tweet-context.js');
      const authorInfo = options.authorInfo && options.authorInfo.username ? {
        username: options.authorInfo.username,
        verified: options.authorInfo.verified || false,
        followerCount: options.authorInfo.follower_count || 0
      } : undefined;
      const contextPrompt = tweetContextAnalyzer.generateContextPrompt(
        options.tweetContext,
        authorInfo,
        options.conversationContext ? {
          parentTweets: options.conversationContext,
          threadLength: options.conversationContext.length,
          isThread: options.conversationContext.length > 0
        } : undefined
      );
      
      if (contextPrompt) {
        enhancedSystemPrompt = `${promptConfig.systemPrompt}\n\n${contextPrompt}`;
      }
    }

    if (!groq) {
      console.log(`❌ [Groq] Groq client not configured`);
      // Return a placeholder reply when Groq is not configured
      return {
        reply:
          "Thanks for sharing! This is a demo reply since Groq isn't configured yet.",
        modelKey: "demo-groq",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      console.log(
        `🔑 [Groq] API key configured: ${!!process.env.GROQ_API_KEY}`,
      );

      // Create the chat completion with streaming
      console.log(`🤖 [Groq] Creating chat completion with streaming...`);
      
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: promptConfig.userPrompt(options.tweetText) },
        ],
        model: modelKey,
        temperature: 0.7,
        max_completion_tokens: 1024,
        top_p: 1,
        stream: true,
        stop: null,
      });

      // Collect streaming response
      let fullReply = '';
      for await (const chunk of chatCompletion) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullReply += content;
      }

      console.log(`📝 [Groq] Raw reply: "${fullReply}"`);

      const processedReply = this.postProcessReply(fullReply);
      console.log(`✨ [Groq] Processed reply: "${processedReply}"`);

      const latencyMs = Date.now() - startTime;
      console.log(`⏱️ [Groq] Total latency: ${latencyMs}ms`);

      // Estimate token usage (Groq doesn't provide exact counts in streaming)
      const estimatedInputTokens = Math.ceil((enhancedSystemPrompt + promptConfig.userPrompt(options.tweetText)).length / 4);
      const estimatedOutputTokens = Math.ceil(processedReply.length / 4);

      console.log(
        `📊 [Groq] Estimated tokens - Input: ${estimatedInputTokens}, Output: ${estimatedOutputTokens}`,
      );

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
      console.error(`❌ [Groq] Error generating reply: ${message}`);
      console.error(`🔧 [Groq] Model used: ${modelKey}`);
      console.error(`🔧 [Groq] Full error:`, error);
      throw new Error(`Failed to generate reply with Groq: ${message}`);
    }
  }

  // Get model information for UI display
  getModelInfo(modelKey: string) {
    return this.MODELS[modelKey as keyof typeof this.MODELS] || null;
  }

  // Get all available models
  getAvailableModels() {
    return Object.entries(this.MODELS).map(([key, info]) => ({
      key,
      ...info,
      provider: "groq",
    }));
  }
}

export const groqModelRouter = new GroqModelRouter();
