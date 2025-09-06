import OpenAI from "openai";

// TODO: Set OPENAI_API_KEY in environment to enable AI reply generation
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
}) : null;

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
  // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
  private getModelForTweet(tweetText: string, modelPreference?: string): string {
    if (modelPreference && modelPreference !== 'auto') {
      return modelPreference;
    }

    // Default routing logic: use gpt-5-mini for most tweets
    // Use gpt-5 for complex or longer tweets
    if (tweetText.length > 280 || this.isComplexTweet(tweetText)) {
      return "gpt-5";
    }
    
    return "gpt-5-mini";
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
    
    return matches > 2 || tweetText.split('\n').length > 2;
  }

  private createSystemPrompt(): string {
    return `You are TweetReply, a social co-pilot for X (Twitter).
You generate one short, human-like reply to tweets.

Rules:
- Output only the reply (no intro, no quotes)
- Use ≤ 25 words
- Match tone of original tweet (serious, funny, supportive)
- Never add hashtags or links
- Avoid generic AI clichés like "game-changing," "revolutionary"
- If tweet is unclear, reply with a neutral supportive comment
- Sound conversational and natural, not robotic
- Encourage agreement, curiosity, gentle humor, or short insights`;
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
    
    // Ensure it's under 25 words
    const words = processed.split(/\s+/);
    if (words.length > 25) {
      processed = words.slice(0, 25).join(' ');
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
    
    bannedPatterns.forEach(pattern => {
      processed = processed.replace(pattern, '');
    });
    
    return processed.trim();
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const startTime = Date.now();
    const modelKey = this.getModelForTweet(options.tweetText, options.modelPreference);
    
    if (!openai) {
      // Return a placeholder reply when OpenAI is not configured
      return {
        reply: "Thanks for sharing! This is a demo reply since OpenAI isn't configured yet.",
        modelKey: "demo",
        latencyMs: Date.now() - startTime,
      };
    }
    
    try {
      const response = await openai.chat.completions.create({
        model: modelKey,
        messages: [
          { role: "system", content: this.createSystemPrompt() },
          { role: "user", content: this.createUserPrompt(options.tweetText) }
        ],
        max_tokens: 60, // Keep responses short
        temperature: 0.7, // Some creativity but not too random
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
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to generate reply: ${message}`);
    }
  }
}

export const modelRouter = new ModelRouter();
