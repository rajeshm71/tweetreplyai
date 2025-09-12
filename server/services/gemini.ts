import { GoogleGenAI } from "@google/genai";
import { ReplyOptions, ReplyResponse } from "./openai.js";

// Initialize Gemini AI client with official SDK
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

export class GeminiModelRouter {
  // Available Gemini models with their characteristics - REAL MODEL NAMES
  private readonly MODELS = {
    "gemini-2.5-pro": {
      name: "gemini-2.5-pro",
      inputCost: 3.50, // per 1M tokens
      outputCost: 10.50, // per 1M tokens
      contextWindow: 1048576,
      description: "Enhanced thinking and reasoning, multimodal understanding, advanced coding",
    },
    "gemini-2.5-flash": {
      name: "gemini-2.5-flash", 
      inputCost: 0.35, // per 1M tokens
      outputCost: 1.05, // per 1M tokens
      contextWindow: 1048576,
      description: "Best price-performance ratio, well-rounded capabilities",
    },
    "gemini-2.5-flash-lite": {
      name: "gemini-2.5-flash-lite",
      inputCost: 0.075, // per 1M tokens
      outputCost: 0.30, // per 1M tokens
      contextWindow: 1048576,
      description: "Most cost-efficient model supporting high throughput",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }

    // Default routing logic for Gemini 2.5 models
    if (tweetText.length > 280 || this.isComplexTweet(tweetText)) {
      return "gemini-2.5-flash"; // Best balance for complex content
    }

    // Use Flash-Lite for simple tweets (most cost-effective)
    return "gemini-2.5-flash-lite";
  }

  private isComplexTweet(tweetText: string): boolean {
    // Same complexity detection as OpenAI service
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

  private createSystemPrompt(): string {
    return `You are TweetReply, a social co-pilot for X (Twitter).
You generate one short, human like reply to tweets that feels authentic and personal.

Core Rules:
- Start with a capital letter, then use lowercase for the rest
- Output only the reply (no intro, no quotes)  
- Use ≤ 40 words
- Match the original tweet's energy and tone exactly
- Never add hashtags, links, or obvious promotional content
- Avoid AI buzzwords like "game-changing," "revolutionary," "amazing insight"
- Make sure you do not use dash(-) between words and do not use em dash(—) in reply
- Avoid words like "sounds like", "feels like" etc.

Authenticity Guidelines:
- React to something specific in the tweet, not just the general topic
- Use contractions naturally (don't, can't, I'm, that's)
- Include personal touches: "reminds me of..." "had this happen..." "same here"
- Use current, natural language patterns and mild slang when appropriate
- Sometimes politely disagree or offer a different perspective
- Reference shared experiences or relatable moments

Response Variety:
- Supportive: "felt this" "totally get it" "been there"  
- Curious: "wait, how did..." "what made you..."
- Experiential: "same thing happened when I..." "reminds me of..."
- Gently challenging: "interesting, though I wonder if..." "fair point, but..."
- Reactive: "no way!" "wait what?" "that's wild"

Decision Rules:
- Binary choices: Pick one side clearly; add a 3–6 word reason.

If the tweet is unclear, respond with genuine confusion or ask for clarification rather than generic support.

Sound like a real person scrolling their feed, not a customer service bot.`;
  }

  private createUserPrompt(tweetText: string): string {
    return `Tweet: "${tweetText}"

Instructions:
- Write 1 authentic reply to this tweet
- Keep it short, conversational, and natural
- Avoid hashtags, hype, or emojis unless essential`;
  }

  private postProcessReply(reply: string): string {
    // Same post-processing as OpenAI service
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

    console.log(`🚀 [Gemini] Starting request with model: ${modelKey}`);
    console.log(`📝 [Gemini] Tweet text: "${options.tweetText}"`);

    if (!genAI) {
      console.log(`❌ [Gemini] Gemini client not configured`);
      // Return a placeholder reply when Gemini is not configured
      return {
        reply:
          "Thanks for sharing! This is a demo reply since Gemini isn't configured yet.",
        modelKey: "demo-gemini",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      console.log(`🔑 [Gemini] API key configured: ${!!process.env.GEMINI_API_KEY}`);
      
      // Get the generative model instance
      console.log(`🤖 [Gemini] Getting generative model instance...`);
      const model = genAI.getGenerativeModel({ model: modelKey });

      // Create the full prompt with system instructions
      const fullPrompt = `${this.createSystemPrompt()}

${this.createUserPrompt(options.tweetText)}`;
      
      console.log(`📏 [Gemini] Prompt length: ${fullPrompt.length} characters`);

      // Generate content with proper configuration
      const requestConfig = {
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          maxOutputTokens: 60, // Keep responses short
          temperature: 0.7,
        },
      };

      console.log(`🔧 [Gemini] Generation config: ${JSON.stringify(requestConfig.generationConfig)}`);
      console.log(`📡 [Gemini] Making API request to Gemini...`);

      const result = await model.generateContent(requestConfig);

      console.log(`✅ [Gemini] API response received`);
      console.log(`🔍 [Gemini] Result object keys:`, Object.keys(result));

      // Get the response text correctly
      const response = await result.response;
      console.log(`📦 [Gemini] Response object keys:`, Object.keys(response));
      console.log(`🔍 [Gemini] Response candidates:`, response.candidates?.length);

      const rawReply = response.text() || "";
      console.log(`📝 [Gemini] Raw reply: "${rawReply}"`);

      const processedReply = this.postProcessReply(rawReply);
      console.log(`✨ [Gemini] Processed reply: "${processedReply}"`);

      const latencyMs = Date.now() - startTime;
      console.log(`⏱️ [Gemini] Total latency: ${latencyMs}ms`);

      // Estimate token usage (Gemini doesn't provide exact counts in free tier)
      const estimatedInputTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens = Math.ceil(processedReply.length / 4);

      console.log(`📊 [Gemini] Estimated tokens - Input: ${estimatedInputTokens}, Output: ${estimatedOutputTokens}`);

      return {
        reply: processedReply,
        modelKey,
        tokensIn: estimatedInputTokens,
        tokensOut: estimatedOutputTokens,
        latencyMs,
      };
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Unknown error";
      console.error(`❌ [Gemini] Error generating reply: ${message}`);
      console.error(`🔧 [Gemini] Model used: ${modelKey}`);
      console.error(`🔧 [Gemini] Full error:`, error);
      throw new Error(`Failed to generate reply with Gemini: ${message}`);
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
      provider: "gemini",
    }));
  }
}

export const geminiModelRouter = new GeminiModelRouter();