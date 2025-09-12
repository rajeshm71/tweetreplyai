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
    // GPT-4.1 Series (Latest flagship models)
    "gpt-4.1": {
      name: "gpt-4.1",
      inputCost: 2.50, // per 1M tokens (estimated)
      outputCost: 10.0, // per 1M tokens (estimated)
      contextWindow: 1000000, // 1M tokens
      description: "Latest flagship multimodal model",
    },
    "gpt-4.1-mini": {
      name: "gpt-4.1-mini",
      inputCost: 0.30, // per 1M tokens (estimated)
      outputCost: 1.20, // per 1M tokens (estimated)
      contextWindow: 1000000,
      description: "High performance at lower cost",
    },
    "gpt-4.1-nano": {
      name: "gpt-4.1-nano",
      inputCost: 0.10, // per 1M tokens (estimated)
      outputCost: 0.40, // per 1M tokens (estimated)
      contextWindow: 1000000,
      description: "Fastest and most cost-effective",
    },
    // GPT-4o Series (Current stable models)
    "gpt-4o": {
      name: "gpt-4o",
      inputCost: 2.50, // per 1M tokens
      outputCost: 10.0, // per 1M tokens
      contextWindow: 128000,
      description: "Multimodal model with vision capabilities",
    },
    "gpt-4o-mini": {
      name: "gpt-4o-mini",
      inputCost: 0.15, // per 1M tokens
      outputCost: 0.60, // per 1M tokens
      contextWindow: 128000,
      description: "Cost-effective multimodal option",
    },
    // GPT-4 Turbo (Reliable workhorse)
    "gpt-4-turbo": {
      name: "gpt-4-turbo",
      inputCost: 10.0, // per 1M tokens
      outputCost: 30.0, // per 1M tokens
      contextWindow: 128000,
      description: "Fast and reliable for complex tasks",
    },
  } as const;

  private getModelForTweet(
    tweetText: string,
    modelPreference?: string,
  ): string {
    if (modelPreference && modelPreference in this.MODELS) {
      return modelPreference;
    }

    // Default routing logic with proven stable models
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

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(
      options.tweetText,
      options.modelPreference,
    );

    if (!openai) {
      // Return a placeholder reply when OpenAI is not configured
      return {
        reply:
          "Thanks for sharing! This is a demo reply since OpenAI isn't configured yet.",
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }

    try {
      const response = await openai.chat.completions.create({
        model: modelKey,
        messages: [
          { role: "system", content: this.createSystemPrompt() },
          { role: "user", content: this.createUserPrompt(options.tweetText) },
        ],
        max_tokens: 60, // Keep responses short
      });

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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
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
