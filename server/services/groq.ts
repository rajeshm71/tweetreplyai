import { Groq } from "groq-sdk";
import { ReplyOptions, ReplyResponse } from "./openai.js";
import { getPromptConfig, applyReplyModeToPrompt, type PromptConfig } from "./prompts.js";
import { replyPostProcessor } from "./reply-postprocessor.js";
import { buildSystemPrompt, buildUserPromptWithThread } from "./prompt-builder.js";
import { AI_MODELS, AI_PARAMS, MODEL_SPECS } from "../config/constants.js";

// Initialize Groq client
const groq = process.env.GROQ_API_KEY ? new Groq() : null;

export class GroqModelRouter {
  private readonly MODELS = {
    [AI_MODELS.DEFAULT]: {
      name: "Fast",
      ...MODEL_SPECS.LLAMA_SCOUT,
      description: "Fast, low-latency model for quick replies",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }
    return AI_MODELS.DEFAULT;
  }

  private getPromptConfig(promptVariation?: string): PromptConfig {
    return getPromptConfig(promptVariation);
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

    const enhancedSystemPrompt = await buildSystemPrompt({
      baseSystemPrompt: promptConfig.systemPrompt,
      tweetAnalysis: options.tweetAnalysis,
      tweetContext: options.tweetContext,
      authorInfo: options.authorInfo,
      threadContext: options.threadContext,
      viewerIsOriginalAuthor: options.viewerIsOriginalAuthor,
    });

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
      const userPromptText = buildUserPromptWithThread(
        promptConfig.userPrompt(options.tweetText),
        options.threadContext
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

      const chatCompletion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: enhancedSystemPrompt },
          { role: "user", content: userPromptText },
        ],
        model: modelKey,
        temperature: AI_PARAMS.TEMPERATURE,
        max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
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

      const processedReply = this.postProcessReply(fullReply, options.replyMode);
      const latencyMs = Date.now() - startTime;

      const estimatedInputTokens = Math.ceil((enhancedSystemPrompt + userPromptText).length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);
      const estimatedOutputTokens = Math.ceil(processedReply.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN);

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
