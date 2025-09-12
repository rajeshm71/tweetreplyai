import OpenAI from "openai";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null;

export interface ReplyOptions {
  tweetText: string;
  tweetId?: string;
  modelPreference?: string;
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
      outputCost: 0.60, // per 1M tokens
      contextWindow: 128000,
      description: "Cost-effective multimodal option",
    },
    "gpt-4o": {
      name: "gpt-4o",
      inputCost: 2.50, // per 1M tokens
      outputCost: 10.0, // per 1M tokens
      contextWindow: 128000,
      description: "Multimodal model with vision capabilities",
    },
    // GPT-5 Series (Latest flagship models)
    "gpt-5": {
      name: "gpt-5",
      inputCost: 1.25, // per 1M tokens
      outputCost: 10.0, // per 1M tokens
      contextWindow: 272000,
      description: "Latest flagship model with reasoning capabilities",
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
      outputCost: 0.40, // per 1M tokens
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
      return "gpt-4o"; // Reliable multimodal for complex tweets
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

  private isGPT5Model(modelKey: string): boolean {
    return modelKey.startsWith("gpt-5");
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );

    console.log(`🚀 [OpenAI] Starting request with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${options.tweetText}"`);
    console.log(`⚡ [OpenAI] Is GPT-5 model: ${this.isGPT5Model(modelKey)}`);

    if (!openai) {
      console.log(`❌ [OpenAI] OpenAI client not configured`);
      // Return a placeholder reply when OpenAI is not configured
      return {
        reply:
          "Thanks for sharing! This is a demo reply since OpenAI isn't configured yet.",
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      // GPT-5 models use max_completion_tokens, GPT-4 models use max_tokens
      const completionParams: any = {
        model: modelKey,
        messages: [
          { role: "system", content: this.createSystemPrompt() },
          { role: "user", content: this.createUserPrompt(options.tweetText) },
        ],
      };

      if (this.isGPT5Model(modelKey)) {
        completionParams.max_completion_tokens = 60;
        console.log(`🔧 [OpenAI] Using max_completion_tokens=60 for GPT-5 model`);
      } else {
        completionParams.max_tokens = 60;
        console.log(`🔧 [OpenAI] Using max_tokens=60 for GPT-4 model`);
      }

      console.log(`📡 [OpenAI] Making API request to OpenAI...`);
      console.log(`🔑 [OpenAI] API key configured: ${!!process.env.OPENAI_API_KEY}`);
      
      const response = await openai.chat.completions.create(completionParams);

      console.log(`✅ [OpenAI] API response received`);
      console.log(`🔍 [OpenAI] Choices length: ${response.choices?.length}`);
      console.log(`📊 [OpenAI] Usage: ${JSON.stringify(response.usage)}`);

      const rawReply = response.choices[0]?.message?.content || "";
      console.log(`📝 [OpenAI] Raw reply: "${rawReply}"`);

      const processedReply = this.postProcessReply(rawReply);
      console.log(`✨ [OpenAI] Processed reply: "${processedReply}"`);

      const latencyMs = Date.now() - startTime;
      console.log(`⏱️ [OpenAI] Total latency: ${latencyMs}ms`);

      return {
        reply: processedReply,
        modelKey,
        tokensIn: response.usage?.prompt_tokens,
        tokensOut: response.usage?.completion_tokens,
        latencyMs,
      };
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
