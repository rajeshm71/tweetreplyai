import OpenAI from "openai";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import type { EnrichedTweetAnalysis } from "./tweet-analysis-agents.js";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

export interface ReplyOptions {
  tweetText: string;
  tweetId?: string;
  modelPreference?: string;
  promptVariation?: string;
  replyMode?: string; // Reply mode: 'single-sentence' | 'base' | 'enhanced'
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
  conversationContext?: any; // ConversationContext format for backward compatibility
  tweetMetadata?: {
    has_media?: boolean;
    has_poll?: boolean;
    timestamp?: string;
  };
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

  private postProcessReply(reply: string, isImprovedDraft: boolean = false, replyMode?: string): string {
    // For improved drafts, use lighter post-processing to preserve AI improvements
    if (isImprovedDraft) {
      return replyPostProcessor.processReplyLight(reply);
    }
    // Use comprehensive postprocessor service for regular replies, passing replyMode
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

    console.log(`🚀 [OpenAI] Starting request with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${options.tweetText}"`);
    console.log(`🎯 [OpenAI] Using prompt: ${promptConfig.name} (mode: ${options.replyMode || 'base'})`);
    // FIX: Enhanced mode logging for better debugging
    const modeDescription = options.replyMode === 'single-sentence' ? 'Fast single sentence' :
                           options.replyMode === 'enhanced' ? 'AI analysis enabled' :
                           'Standard generation';
    console.log(`⚙️  [OpenAI] Reply mode: ${options.replyMode || 'base'} - ${modeDescription}`);

    // Generate context-aware prompt if context is available
    let enhancedSystemPrompt = promptConfig.systemPrompt;
    const originalPromptLength = enhancedSystemPrompt.length;
    
    // Inject enriched analysis context if available (from AI agents)
    if (options.tweetAnalysis && options.tweetAnalysis.enrichedContextPrompt) {
      console.log(`🧠 [OpenAI] Injecting enriched tweet analysis context`);
      console.log(`📊 [OpenAI] Analysis summary:`, {
        tone: options.tweetAnalysis.understanding?.tone || 'unknown',
        sentiment: options.tweetAnalysis.understanding?.sentiment || 'unknown',
        style: options.tweetAnalysis.understanding?.style || 'unknown',
        intentionPreview: options.tweetAnalysis.intention?.intention?.substring(0, 60) + '...' || 'N/A'
      });
      enhancedSystemPrompt = `${options.tweetAnalysis.enrichedContextPrompt}\n\n${enhancedSystemPrompt}`;
      console.log(`📏 [OpenAI] Prompt length: ${originalPromptLength} → ${enhancedSystemPrompt.length} chars (+${enhancedSystemPrompt.length - originalPromptLength})`);
    } else {
      console.log(`⚠️ [OpenAI] No tweet analysis available - using basic prompt only`);
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
        
        const response = await openai.responses.create({
          model: modelKey,
          input: [
            { role: "system", content: enhancedSystemPrompt },
            { role: "user", content: userPromptText },
          ],
          top_p: 1,
          temperature: 0.7,
          //max_output_tokens: 1000,
        });
        console.log(`📝 [OpenAI] Response received:`, response);
        const rawReply = response.output_text || "";
        const processedReply = this.postProcessReply(rawReply, false, options.replyMode);
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
        
        const response = await openai.chat.completions.create({
          model: modelKey,
          messages: [
            { role: "system", content: enhancedSystemPrompt },
            { role: "user", content: userPromptText },
          ],
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
        });
        console.log(`📝 [OpenAI] Response received:`, response);
        const rawReply = response.choices[0]?.message?.content || "";
        const processedReply = this.postProcessReply(rawReply, false, options.replyMode);
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

  async improveDraft(tweetText: string, draftReply: string, modelPreference?: string): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(tweetText, modelPreference);
    const promptConfig = this.getPromptConfig('improve');

    console.log(`🚀 [OpenAI] Starting improvement with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${tweetText}"`);
    console.log(`📝 [OpenAI] Draft reply: "${draftReply}"`);

    // Create custom user prompt for improvement - make it explicit that we're improving the draft
    const userPrompt = `Original Tweet: "${tweetText}"

User's Draft Reply (needs improvement): "${draftReply}"

IMPORTANT: The user has already written a draft reply above. Your task is to ENHANCE and IMPROVE this specific draft, not write a new reply.

Please:
1. Fix any spelling errors (e.g., "bt" → "but")
2. Fix grammar mistakes
3. Make it more natural and conversational
4. Improve clarity while keeping the same meaning
5. Keep it under 200 characters
6. Preserve the user's intent and message

Return ONLY the improved version of the draft, nothing else.`;

    if (!openai) {
      console.log("❌ [OpenAI] OpenAI client not configured");
      return {
        reply: draftReply, // Return original if AI not configured
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
            { role: "user", content: userPrompt },
          ],
          top_p: 1,
          temperature: 0.7,
        });
        console.log(`📝 [OpenAI] Improvement response received:`, response);
        const rawReply = response.output_text || "";
        console.log(`🔍 [OpenAI] Raw AI response before post-processing: "${rawReply}"`);
        const processedReply = this.postProcessReply(rawReply, true); // Pass true to indicate this is an improved draft
        console.log(`✨ [OpenAI] Post-processed improved reply: "${processedReply}"`);
        
        // Validate that improved version is different from original
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
      } else {
        // Use chat completions API for GPT-4 models
        console.log(
          `🚀 [OpenAI] Using chat completions for improvement with model: ${modelKey}`,
        );
        const response = await openai.chat.completions.create({
          model: modelKey,
          messages: [
            { role: "system", content: promptConfig.systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          frequency_penalty: 0.5,
          presence_penalty: 0.5,
        });
        console.log(`📝 [OpenAI] Improvement response received:`, response);
        const rawReply = response.choices[0]?.message?.content || "";
        console.log(`🔍 [OpenAI] Raw AI response before post-processing: "${rawReply}"`);
        const processedReply = this.postProcessReply(rawReply, true); // Pass true to indicate this is an improved draft
        console.log(`✨ [OpenAI] Post-processed improved reply: "${processedReply}"`);
        
        // Validate that improved version is different from original
        const originalNormalized = draftReply.trim().toLowerCase();
        const improvedNormalized = processedReply.trim().toLowerCase();
        if (originalNormalized === improvedNormalized) {
          console.warn(`⚠️ [OpenAI] Improved version is identical to original draft! Original: "${draftReply}", Improved: "${processedReply}"`);
        }
        
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
      console.error(`❌ [OpenAI] Error improving draft: ${message}`);
      console.error(`🔧 [OpenAI] Model used: ${modelKey}`);
      console.error(`🔧 [OpenAI] Full error:`, error);
      throw new Error(`Failed to improve draft: ${message}`);
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
