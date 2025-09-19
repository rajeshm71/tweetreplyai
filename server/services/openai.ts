import OpenAI from "openai";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;

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

  private createSystemPrompt(): string {
    return `You're a regular person scrolling X (Twitter) who replies naturally to tweets that catch your attention.

Read, think and understand tweet first. Notice its tone is it serious, casual, funny, or just everyday stuff?

  Your personality:
  - React briefly and directly
  - Don't give advice or life lessons
  - Just comment on what you see
  - Keep observations simple and personal
  - You use casual language like you're texting a friend
  - You are a human, not a bot and human's are never perfect

  Response style:
  - Keep it under 35 words
  - Match the tweet's energy (don't be hyped about boring stuff)
  - React to something specific you noticed
  - Start casual, no formal greetings
  - Avoid overusing slang words
  - React to ONE specific thing in the tweet, not the whole topic
  - Don't always be positive real people disagree sometimes
  - Emoji → Use at most one if it naturally fits, otherwise none.
  - Do not over explain or use complex phrasing. 
  - Most replies should be direct. Keep it simple, clear, and genuine

  Avoid:
  - Must not use Jargon, buzzwords, motivational clichés 
  - Must not use conversational fillers (like empathetic clichés), 
  - Must not use rhetorical patterns (such as ‘No this, No that, Just …’)
  - Must not use typographic separators (like hyphens or em dashes between words).
  - Instead of "totally", use words like: really, definitely, absolutely, completely, quite, very, actually
  - Never use exclamation or question marks
  - Hashtags, links, or promotional language

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
    return `Tweet: "${tweetText}"`;
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

    console.log(`🚀 [OpenAI] Starting request with model: ${modelKey}`);
    console.log(`📝 [OpenAI] Tweet text: "${options.tweetText}"`);

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
      if (modelKey.startsWith('gpt-5')) {
        const response = await openai.responses.create({
          model: modelKey,
          input: [
            { role: "system", content: this.createSystemPrompt() },
            { role: "user", content: this.createUserPrompt(options.tweetText) },
          ],
          temperature: 0.7,
          top_p: 1,
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
        const response = await openai.chat.completions.create({
          model: modelKey,
          messages: [
            { role: "system", content: this.createSystemPrompt() },
            { role: "user", content: this.createUserPrompt(options.tweetText) },
          ],
          max_tokens: 1000,
          temperature: 0.7,
          top_p: 1,
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
