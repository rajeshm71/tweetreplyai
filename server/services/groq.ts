import { Groq } from "groq-sdk";
import { ReplyOptions, ReplyResponse } from "./openai.js";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { replyPostProcessor } from "./reply-postprocessor.js";

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

  private postProcessReply(reply: string, replyMode?: string): string {
    // Use comprehensive postprocessor service, passing replyMode
    return replyPostProcessor.processReply(reply, replyMode);
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );
    const basePromptConfig = this.getPromptConfig(options.promptVariation);
    
    // Apply reply mode modifications to prompt
    const promptConfig = applyReplyModeToPrompt(basePromptConfig, options.replyMode);

    console.log(`🚀 [Groq] Starting request with model: ${modelKey}`);
    console.log(`📝 [Groq] Tweet text: "${options.tweetText}"`);
    console.log(`🎯 [Groq] Using prompt: ${promptConfig.name} (mode: ${options.replyMode || 'base'})`);
    // FIX: Enhanced mode logging for better debugging
    const modeDescription = options.replyMode === 'single-sentence' ? 'Fast single sentence' :
                           options.replyMode === 'enhanced' ? 'AI analysis enabled' :
                           'Standard generation';
    console.log(`⚙️  [Groq] Reply mode: ${options.replyMode || 'base'} - ${modeDescription}`);

    // Generate context-aware prompt if context is available
    let enhancedSystemPrompt = promptConfig.systemPrompt;
    const originalPromptLength = enhancedSystemPrompt.length;
    
    // Inject enriched analysis context if available (from AI agents)
    if (options.tweetAnalysis && options.tweetAnalysis.enrichedContextPrompt) {
      console.log(`🧠 [Groq] Injecting enriched tweet analysis context`);
      console.log(`📊 [Groq] Analysis summary:`, {
        tone: options.tweetAnalysis.understanding?.tone || 'unknown',
        sentiment: options.tweetAnalysis.understanding?.sentiment || 'unknown',
        style: options.tweetAnalysis.understanding?.style || 'unknown',
        intentionPreview: options.tweetAnalysis.intention?.intention?.substring(0, 60) + '...' || 'N/A'
      });
      enhancedSystemPrompt = `${options.tweetAnalysis.enrichedContextPrompt}\n\n${enhancedSystemPrompt}`;
      console.log(`📏 [Groq] Prompt length: ${originalPromptLength} → ${enhancedSystemPrompt.length} chars (+${enhancedSystemPrompt.length - originalPromptLength})`);
    } else {
      console.log(`⚠️ [Groq] No tweet analysis available - using basic prompt only`);
    }
    
    // Add existing tweet context (fallback or additional context)
    if (options.tweetContext) {
      const { tweetContextAnalyzer } = await import('./tweet-context.js');
      const authorInfo = options.authorInfo && options.authorInfo.username ? {
        username: options.authorInfo.username,
        verified: options.authorInfo.verified || false,
        followerCount: options.authorInfo.follower_count || 0
      } : undefined;
      // Use conversationContext if provided (already in correct format), otherwise convert from threadContext
      const conversationContextForPrompt = options.conversationContext || 
        (options.threadContext ? {
          parentTweets: options.threadContext.threadChain.map(t => t.text),
          threadLength: options.threadContext.threadLength,
          isThread: options.threadContext.isReply,
          originalTweet: options.threadContext.originalTweet,
          originalTweetAuthor: options.threadContext.originalTweetAuthor,
          threadChain: options.threadContext.threadChain,
          currentTweetIndex: options.threadContext.currentTweetIndex
        } : undefined);
      const contextPrompt = tweetContextAnalyzer.generateContextPrompt(
        options.tweetContext,
        authorInfo,
        conversationContextForPrompt
      );
      
      if (contextPrompt) {
        enhancedSystemPrompt = `${enhancedSystemPrompt}\n\n${contextPrompt}`;
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
      
      // Build user prompt with thread context
      let userPromptText = promptConfig.userPrompt(options.tweetText);
      if (options.threadContext && options.threadContext.isReply) {
        if (options.threadContext.originalTweet) {
          userPromptText += `\n\nNote: This tweet is a reply. The original tweet that started this conversation was: "${options.threadContext.originalTweet}"`;
        }
        if (options.threadContext.threadChain && options.threadContext.threadChain.length > 1) {
          userPromptText += `\n\nFull conversation thread:`;
          options.threadContext.threadChain.forEach((tweet, idx) => {
            const label = tweet.isOriginal ? 'Original' : tweet.isCurrent ? 'Current (replying to)' : `Reply ${idx}`;
            userPromptText += `\n${label}: "${tweet.text}"`;
          });
        }
      }
      
      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: userPromptText },
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

      const processedReply = this.postProcessReply(fullReply, options.replyMode);
      console.log(`✨ [Groq] Processed reply: "${processedReply}"`);

      const latencyMs = Date.now() - startTime;
      console.log(`⏱️ [Groq] Total latency: ${latencyMs}ms`);

      // Estimate token usage (Groq doesn't provide exact counts in streaming)
      const estimatedInputTokens = Math.ceil((enhancedSystemPrompt + userPromptText).length / 4);
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
