import { GoogleGenAI } from "@google/genai";
import { ReplyOptions, ReplyResponse } from "./openai.js";

// Initialize Gemini AI client with official SDK
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

export class GeminiModelRouter {
  // Available Gemini models with their characteristics - REAL MODEL NAMES
  private readonly MODELS = {
    "gemini-2.5-pro": {
      name: "gemini-2.5-pro",
      inputCost: 1.25, // per 1M tokens
      outputCost: 10, // per 1M tokens
      contextWindow: 1048576,
      description:
        "Enhanced thinking and reasoning, multimodal understanding, advanced coding",
    },
    "gemini-2.5-flash": {
      name: "gemini-2.5-flash",
      inputCost: 0.3, // per 1M tokens
      outputCost: 2.5, // per 1M tokens
      contextWindow: 1048576,
      description: "Best price performance ratio, well-rounded capabilities",
    },
    "gemini-2.5-flash-lite": {
      name: "gemini-2.5-flash-lite",
      inputCost: 0.1, // per 1M tokens
      outputCost: 0.4, // per 1M tokens
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
    return `You're a regular person scrolling X (Twitter) who replies naturally to tweets that catch your attention.

  Read the tweet first. Notice its tone - is it serious, casual, funny, or just everyday stuff?


    Your personality:
    - You have your own opinions and experiences
    - You are trying to be helpful or professional
    - You react genuinely
    - You use casual language like you're texting a friend

    Response style:
    - Keep it under 35 words
    - Match the tweet's energy (don't be hyped about boring stuff)
    - React to something specific you noticed
    - Start casual, no formal greetings
    - Use varied, natural language don't repeat the same expressions
    - Sometimes be casual, sometimes more direct
    - Avoid overusing slang words
    - Include typos or informal grammar occasionally (but stay readable)
    - React to ONE specific thing in the tweet, not the whole topic
    - Sometimes be a bit sarcastic or playful
    - Don't always be positive real people disagree sometimes
    - Emoji → Use at most one if it naturally fits, otherwise none.

    Avoid:
    - Must not use Jargon, buzzwords, motivational clichés 
    - Must not use conversational fillers (like empathetic clichés), 
    - Must not use rhetorical patterns (such as ‘No this, No that, Just …’)
    - Must not use typographic separators (like hyphens or em dashes between words).
    - Being overly encouraging or supportive
    - Hashtags, links, or promotional language
    - Explaining things unless asked
    - Being fake positive about everything

    Decision Rules:
    - Binary choices: Pick one side clearly; add a 3–6 word reason.

    TONE GUIDELINES:
    - For serious tweets: respond thoughtfully but briefly
    - For funny tweets: light humor or simple appreciation
    - For controversial tweets: stay neutral or politely disagree
    - For everyday tweets: casual acknowledgment
    - For exciting news: mild interest or brief congratulations

    Be genuine. Not every tweet needs a big reaction. Sometimes "yeah" or "makes sense" is perfect. Other times you might be more engaged. Just respond how you naturally would as a person`;
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
      console.log(
        `🔑 [Gemini] API key configured: ${!!process.env.GEMINI_API_KEY}`,
      );

      // Get the generative model instance
      console.log(`🤖 [Gemini] Getting generative model instance...`);
      //const model = genAI.getGenerativeModel({ model: modelKey });

      // Create the full prompt with system instructions
      const fullPrompt = `${this.createSystemPrompt()}

${this.createUserPrompt(options.tweetText)}`;

      console.log(`📏 [Gemini] Prompt length: ${fullPrompt.length} characters`);

      const response = await genAI.models.generateContent({
        model: modelKey,
        contents: fullPrompt,
        config: {
          maxOutputTokens: 1000,
          temperature: 0.7,
        },
      });
      console.log(`📝 [Gemini] Response received:`, response);
      const rawReply = response.text || "";

      //const rawReply = response.text() || "";
      console.log(`📝 [Gemini] Raw reply: "${rawReply}"`);

      const processedReply = this.postProcessReply(rawReply);
      console.log(`✨ [Gemini] Processed reply: "${processedReply}"`);

      const latencyMs = Date.now() - startTime;
      console.log(`⏱️ [Gemini] Total latency: ${latencyMs}ms`);

      // Estimate token usage (Gemini doesn't provide exact counts in free tier)
      const estimatedInputTokens =
        response.usageMetadata?.promptTokenCount ||
        Math.ceil(fullPrompt.length / 4);
      const estimatedOutputTokens =
        response.usageMetadata?.candidatesTokenCount ||
        Math.ceil(processedReply.length / 4);

      console.log(
        `📊 [Gemini] Estimated tokens - Input: ${estimatedInputTokens}, Output: ${estimatedOutputTokens}`,
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
