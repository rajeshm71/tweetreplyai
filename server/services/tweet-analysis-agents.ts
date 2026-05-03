import OpenAI from "openai";
import { Groq } from "groq-sdk";
import crypto from "crypto";
import { AI_MODELS, AI_PARAMS, CACHE, VALIDATION } from "../config/constants.js";

// Initialize OpenAI and Groq clients for agents
const openai = process.env.OPENAI_API_KEY ? new OpenAI() : null;
const groq = process.env.GROQ_API_KEY ? new Groq() : null;

const TWEET_ANALYSIS_ENABLED = process.env.TWEET_ANALYSIS_ENABLED !== 'false';
const TWEET_ANALYSIS_CACHE_TTL = parseInt(process.env.TWEET_ANALYSIS_CACHE_TTL || String(CACHE.DEFAULT_TTL_SECONDS), 10);
const TWEET_ANALYSIS_MODEL = AI_MODELS.ANALYSIS;
console.log('[TweetAnalysis] TWEET_ANALYSIS_DEFAULT_MODEL:', AI_MODELS.DEFAULT);
console.log('[TweetAnalysis] TWEET_ANALYSIS_FALLBACK:', AI_MODELS.FALLBACK);
console.log('[TweetAnalysis] TWEET_ANALYSIS_MODEL (used for both agents):', AI_MODELS.ANALYSIS);

function isGroqModel(modelKey: string): boolean {
  return modelKey.startsWith("meta-llama/") || modelKey.startsWith("llama-");
}

// Interfaces
export interface TweetUnderstandingResult {
  tone: string; // e.g., "sarcastic", "informative", "humorous", "serious", "casual"
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  style: string; // e.g., "conversational", "formal", "playful", "technical"
  complexity: 'simple' | 'medium' | 'complex';
  emotionalMarkers: string[]; // Key emotional indicators found
  keyThemes: string[]; // Main topics or themes
}

export interface IntentionExtractionResult {
  intention: string; // Free-form description of user's intention
  keyThemes: string[]; // Important themes related to the intention
  actionVerbs: string[]; // Action verbs that indicate what the user is doing
  underlyingPurpose: string; // Deeper purpose or goal
}

/** Per-call usage from a tweet-analysis agent (for stage_breakdown). */
export interface AgentUsage {
  promptTokens: number;
  completionTokens: number;
  modelKey: string;
  latencyMs: number;
}

export interface EnrichedTweetAnalysis {
  understanding: TweetUnderstandingResult;
  intention: IntentionExtractionResult;
  enrichedContextPrompt: string; // Formatted context for injection into prompts
  timestamp: Date;
  /** Set only on fresh runs when agents return usage; not set for cached responses. */
  stageUsage?: {
    tweet_understanding?: AgentUsage;
    tweet_intention?: AgentUsage;
  };
}

// Cache entry interface
interface CacheEntry {
  analysis: EnrichedTweetAnalysis;
  timestamp: number;
}

// Cache storage
const analysisCache = new Map<string, CacheEntry>();

// Helper to normalize cache key
function normalizeCacheKey(
  tweetText: string, 
  authorUsername?: string,
  conversationContext?: { parentTweets?: string[]; threadLength?: number; isThread?: boolean }
): string {
  const normalized = tweetText.toLowerCase().trim().replace(/\s+/g, ' ');
  const author = authorUsername ? authorUsername.toLowerCase() : '';
  // Include conversation context in cache key to avoid collisions
  const contextHash = conversationContext?.isThread 
    ? `|thread:${conversationContext.threadLength || 0}` 
    : '';
  // Fix: Add hash to cache key for better uniqueness and collision prevention
  const textHash = crypto.createHash('md5').update(tweetText).digest('hex').substring(0, CACHE.HASH_LENGTH);
  return `${normalized}|${author}${contextHash}|${textHash}`;
}

// Helper to check if cache entry is valid
function isCacheValid(entry: CacheEntry): boolean {
  const age = Date.now() - entry.timestamp;
  return age < TWEET_ANALYSIS_CACHE_TTL * 1000;
}

// Fix: Helper to enforce cache size limit (FIFO eviction)
function enforceCacheSizeLimit(): void {
  if (analysisCache.size >= CACHE.MAX_SIZE) {
    // Remove oldest entry (FIFO - first in, first out)
    const firstKey = analysisCache.keys().next().value;
    if (firstKey) {
      analysisCache.delete(firstKey);
      console.log(`[TweetAnalysisOrchestrator] Cache size limit reached, evicted oldest entry`);
    }
  }
}

// Fix: Timeout wrapper for agent calls
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => 
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

// Tweet Understanding Agent
export class TweetUnderstandingAgent {
  async analyze(tweetText: string, authorInfo?: { username?: string; verified?: boolean; followerCount?: number }): Promise<{ result: TweetUnderstandingResult; usage?: AgentUsage }> {
    const startTime = Date.now();
    const useGroq = isGroqModel(TWEET_ANALYSIS_MODEL) && groq;
    const useOpenAI = !useGroq && openai;

    if (!useGroq && !useOpenAI) {
      console.warn('[TweetUnderstandingAgent] No provider configured for model, returning default analysis');
      return { result: this.getDefaultAnalysis() };
    }

    try {
      const prompt = `Analyze this tweet's tone, sentiment, and style. Provide a structured analysis.

Tweet: "${tweetText}"

Respond with a JSON object containing:
- tone: one word describing the primary tone (e.g., "sarcastic", "informative", "humorous", "serious", "casual", "playful", "technical")
- sentiment: one of "positive", "negative", "neutral", or "mixed"
- style: one word describing the writing style (e.g., "conversational", "formal", "playful", "technical", "casual")
- complexity: one of "simple", "medium", or "complex"
- emotionalMarkers: array of 2-4 key emotional indicators or feelings present
- keyThemes: array of 2-5 main topics or themes mentioned

Return ONLY valid JSON, no additional text.`;

      const messages = [
        { role: "system" as const, content: "You are an expert at analyzing social media content. Return only valid JSON." },
        { role: "user" as const, content: prompt }
      ];

      let content: string | null = null;
      let usage: AgentUsage | undefined;
      if (useGroq) {
        const response = await groq!.chat.completions.create({
          model: TWEET_ANALYSIS_MODEL,
          messages,
          temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_QUICK,
          max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_QUICK,
          response_format: { type: "json_object" }
        });
        content = response.choices[0]?.message?.content ?? null;
        const u = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        const latencyMs = Date.now() - startTime;
        usage = {
          promptTokens: u?.prompt_tokens ?? 0,
          completionTokens: u?.completion_tokens ?? 0,
          modelKey: TWEET_ANALYSIS_MODEL,
          latencyMs,
        };
      } else {
        const response = await openai!.chat.completions.create({
          model: TWEET_ANALYSIS_MODEL,
          messages,
          temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_QUICK,
          max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_QUICK,
          response_format: { type: "json_object" }
        });
        content = response.choices[0]?.message?.content ?? null;
        const u = response.usage;
        const latencyMs = Date.now() - startTime;
        usage = {
          promptTokens: u?.prompt_tokens ?? 0,
          completionTokens: u?.completion_tokens ?? 0,
          modelKey: TWEET_ANALYSIS_MODEL,
          latencyMs,
        };
      }

      if (!content) {
        throw new Error('Empty response from model');
      }

      // Parse and validate JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError: any) {
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      // Validate required fields and provide defaults
      const analysis: TweetUnderstandingResult = {
        tone: parsed.tone || 'neutral',
        sentiment: ['positive', 'negative', 'neutral', 'mixed'].includes(parsed.sentiment) 
          ? parsed.sentiment 
          : 'neutral',
        style: parsed.style || 'casual',
        complexity: ['simple', 'medium', 'complex'].includes(parsed.complexity) 
          ? parsed.complexity 
          : 'medium',
        emotionalMarkers: Array.isArray(parsed.emotionalMarkers) ? parsed.emotionalMarkers : [],
        keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : []
      };

      console.log(`[TweetUnderstandingAgent] Analysis completed in ${usage.latencyMs}ms`);
      console.log('[TweetUnderstandingAgent] model_key for stage_breakdown:', usage.modelKey);
      console.log(`[TweetUnderstandingAgent] Tone: ${analysis.tone}, Sentiment: ${analysis.sentiment}, Style: ${analysis.style}`);
      
      return { result: analysis, usage };
    } catch (error: any) {
      console.error('[TweetUnderstandingAgent] Error:', error.message);
      return { result: this.getDefaultAnalysis() };
    }
  }

  private getDefaultAnalysis(): TweetUnderstandingResult {
    return {
      tone: 'neutral',
      sentiment: 'neutral',
      style: 'casual',
      complexity: 'medium',
      emotionalMarkers: [],
      keyThemes: []
    };
  }
}

// Intention Extraction Agent
export class IntentionExtractionAgent {
  async extract(tweetText: string, authorInfo?: { username?: string; verified?: boolean; followerCount?: number }): Promise<{ result: IntentionExtractionResult; usage?: AgentUsage }> {
    const startTime = Date.now();
    const useGroq = isGroqModel(TWEET_ANALYSIS_MODEL) && groq;
    const useOpenAI = !useGroq && openai;

    if (!useGroq && !useOpenAI) {
      console.warn('[IntentionExtractionAgent] No provider configured for model, returning default extraction');
      return { result: this.getDefaultExtraction() };
    }

    try {
      const prompt = `What is the user's underlying intention or purpose in this tweet? Extract their intent in natural language.

Tweet: "${tweetText}"

Respond with a JSON object containing:
- intention: a 1-2 sentence description of what the user is trying to achieve or express (free-form, natural language)
- keyThemes: array of 2-5 important themes or topics related to this intention
- actionVerbs: array of 2-4 action verbs that indicate what the user is doing (e.g., "asking", "sharing", "complaining", "celebrating")
- underlyingPurpose: a brief sentence describing the deeper purpose or goal behind the tweet

Return ONLY valid JSON, no additional text.`;

      const messages = [
        { role: "system" as const, content: "You are an expert at understanding human intentions in social media. Return only valid JSON." },
        { role: "user" as const, content: prompt }
      ];

      let content: string | null = null;
      let usage: AgentUsage | undefined;
      if (useGroq) {
        const response = await groq!.chat.completions.create({
          model: TWEET_ANALYSIS_MODEL,
          messages,
          temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_DEEP,
          max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_DEEP,
          response_format: { type: "json_object" }
        });
        content = response.choices[0]?.message?.content ?? null;
        const u = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
        const latencyMs = Date.now() - startTime;
        usage = {
          promptTokens: u?.prompt_tokens ?? 0,
          completionTokens: u?.completion_tokens ?? 0,
          modelKey: TWEET_ANALYSIS_MODEL,
          latencyMs,
        };
      } else {
        const response = await openai!.chat.completions.create({
          model: TWEET_ANALYSIS_MODEL,
          messages,
          temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_DEEP,
          max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_DEEP,
          response_format: { type: "json_object" }
        });
        content = response.choices[0]?.message?.content ?? null;
        const u = response.usage;
        const latencyMs = Date.now() - startTime;
        usage = {
          promptTokens: u?.prompt_tokens ?? 0,
          completionTokens: u?.completion_tokens ?? 0,
          modelKey: TWEET_ANALYSIS_MODEL,
          latencyMs,
        };
      }

      if (!content) {
        throw new Error('Empty response from model');
      }

      // Parse and validate JSON response
      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch (parseError: any) {
        throw new Error(`Invalid JSON response: ${parseError.message}`);
      }

      // Validate required fields and provide defaults
      const extraction: IntentionExtractionResult = {
        intention: parsed.intention || 'The user is sharing or expressing something',
        keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : [],
        actionVerbs: Array.isArray(parsed.actionVerbs) ? parsed.actionVerbs : [],
        underlyingPurpose: parsed.underlyingPurpose || 'To communicate with others'
      };

      console.log(`[IntentionExtractionAgent] Extraction completed in ${usage.latencyMs}ms`);
      console.log('[IntentionExtractionAgent] model_key for stage_breakdown:', usage.modelKey);
      const intentionPreview = extraction.intention ? extraction.intention.substring(0, 100) : 'N/A';
      console.log(`[IntentionExtractionAgent] Intention: ${intentionPreview}...`);
      
      return { result: extraction, usage };
    } catch (error: any) {
      console.error('[IntentionExtractionAgent] Error:', error.message);
      return { result: this.getDefaultExtraction() };
    }
  }

  private getDefaultExtraction(): IntentionExtractionResult {
    return {
      intention: 'The user is sharing or expressing something',
      keyThemes: [],
      actionVerbs: [],
      underlyingPurpose: 'To communicate with others'
    };
  }
}

// Tweet Analysis Orchestrator
export class TweetAnalysisOrchestrator {
  private understandingAgent: TweetUnderstandingAgent;
  private intentionAgent: IntentionExtractionAgent;

  constructor() {
    this.understandingAgent = new TweetUnderstandingAgent();
    this.intentionAgent = new IntentionExtractionAgent();
  }

  async analyzeTweet(
    tweetText: string,
    authorInfo?: { username?: string; verified?: boolean; followerCount?: number },
    conversationContext?: { parentTweets?: string[]; threadLength?: number; isThread?: boolean }
  ): Promise<EnrichedTweetAnalysis | null> {
    console.log('[TweetAnalysisOrchestrator] ===== analyzeTweet() called =====');
    console.log('[TweetAnalysisOrchestrator] Feature enabled:', TWEET_ANALYSIS_ENABLED);
    console.log('[TweetAnalysisOrchestrator] Tweet text preview:', tweetText.substring(0, 50) + '...');
    
    // Fix: Input validation - ensure tweet text is valid
    if (!tweetText || typeof tweetText !== 'string' || tweetText.trim().length === 0) {
      console.warn('[TweetAnalysisOrchestrator] ❌ Invalid tweet text: empty or not a string');
      return null;
    }
    if (tweetText.length > VALIDATION.MAX_TWEET_LENGTH) {
      console.warn(`[TweetAnalysisOrchestrator] ❌ Tweet text exceeds maximum length (${tweetText.length} > ${VALIDATION.MAX_TWEET_LENGTH})`);
      return null;
    }

    // Check feature flag
    if (!TWEET_ANALYSIS_ENABLED) {
      console.log('[TweetAnalysisOrchestrator] ⚠️ Feature disabled, skipping analysis');
      return null;
    }

    // Check cache first (include conversation context in key)
    const cacheKey = normalizeCacheKey(tweetText, authorInfo?.username, conversationContext);
    const cached = analysisCache.get(cacheKey);
    if (cached && isCacheValid(cached)) {
      console.log('[TweetAnalysisOrchestrator] Cache hit');
      return cached.analysis;
    }

    console.log('[TweetAnalysisOrchestrator] Cache miss, running agents in parallel');

    const startTime = Date.now();

    try {
      // Fix: Run both agents in parallel with timeout protection
      const [understandingOut, intentionOut] = await Promise.all([
        withTimeout(
          this.understandingAgent.analyze(tweetText, authorInfo),
          CACHE.AGENT_TIMEOUT_MS,
          'TweetUnderstandingAgent'
        ),
        withTimeout(
          this.intentionAgent.extract(tweetText, authorInfo),
          CACHE.AGENT_TIMEOUT_MS,
          'IntentionExtractionAgent'
        )
      ]);

      const understanding = understandingOut.result;
      const intention = intentionOut.result;

      // Fix: Check if both agents returned default values (error masking detection)
      const isDefaultUnderstanding = understanding.tone === 'neutral' && 
        understanding.sentiment === 'neutral' && 
        understanding.emotionalMarkers.length === 0;
      const isDefaultIntention = intention.intention === 'The user is sharing or expressing something' &&
        intention.keyThemes.length === 0 &&
        intention.actionVerbs.length === 0;
      
      if (isDefaultUnderstanding && isDefaultIntention) {
        console.warn('[TweetAnalysisOrchestrator] WARNING: Both agents returned default values - possible silent failure');
      }

      const totalLatency = Date.now() - startTime;
      console.log(`[TweetAnalysisOrchestrator] Parallel execution completed in ${totalLatency}ms`);

      // Generate enriched context prompt
      const enrichedContextPrompt = this.generateEnrichedContextPrompt({
        understanding,
        intention,
        enrichedContextPrompt: '', // Will be set below
        timestamp: new Date()
      });

      const analysis: EnrichedTweetAnalysis = {
        understanding,
        intention,
        enrichedContextPrompt,
        timestamp: new Date()
      };

      // Fix: Enforce cache size limit before storing new entry
      enforceCacheSizeLimit();
      
      // Store in cache (without stageUsage; cached responses won't have per-call usage)
      analysisCache.set(cacheKey, {
        analysis,
        timestamp: Date.now()
      });

      // Log truncated results for debugging
      console.log(`[TweetAnalysisOrchestrator] Analysis complete - Tone: ${understanding.tone}, Sentiment: ${understanding.sentiment}`);
      const intentionPreview = intention.intention ? intention.intention.substring(0, 80) : 'N/A';
      console.log(`[TweetAnalysisOrchestrator] Intention: ${intentionPreview}...`);

      // Attach stageUsage for reply_tokens (only on fresh run; not stored in cache)
      const stageUsage: EnrichedTweetAnalysis['stageUsage'] = {};
      if (understandingOut.usage) stageUsage.tweet_understanding = understandingOut.usage;
      if (intentionOut.usage) stageUsage.tweet_intention = intentionOut.usage;
      return { ...analysis, stageUsage: Object.keys(stageUsage).length > 0 ? stageUsage : undefined };
    } catch (error: any) {
      console.error('[TweetAnalysisOrchestrator] Error during analysis:', error.message);
      console.error('[TweetAnalysisOrchestrator] Stack:', error.stack);
      return null; // Return null to trigger fallback
    }
  }

  private generateEnrichedContextPrompt(analysis: EnrichedTweetAnalysis): string {
    const parts: string[] = [];

    // Tweet Analysis section
    parts.push(`Tweet Analysis:`);
    parts.push(`- Tone: ${analysis.understanding.tone}`);
    parts.push(`- Sentiment: ${analysis.understanding.sentiment}`);
    parts.push(`- Style: ${analysis.understanding.style}`);
    parts.push(`- Complexity: ${analysis.understanding.complexity}`);
    
    // Safely handle potentially undefined arrays
    if (analysis.understanding.emotionalMarkers && analysis.understanding.emotionalMarkers.length > 0) {
      parts.push(`- Emotional markers: ${analysis.understanding.emotionalMarkers.join(', ')}`);
    }
    
    if (analysis.understanding.keyThemes && analysis.understanding.keyThemes.length > 0) {
      parts.push(`- Key themes: ${analysis.understanding.keyThemes.join(', ')}`);
    }

    // User Intention section
    parts.push(``);
    parts.push(`User Intention: ${analysis.intention.intention}`);
    
    if (analysis.intention.underlyingPurpose) {
      parts.push(`Underlying Purpose: ${analysis.intention.underlyingPurpose}`);
    }
    
    // Safely handle potentially undefined arrays
    if (analysis.intention.actionVerbs && analysis.intention.actionVerbs.length > 0) {
      parts.push(`Action indicators: ${analysis.intention.actionVerbs.join(', ')}`);
    }

    // Reply Guidance section
    parts.push(``);
    parts.push(`Reply Guidance:`);
    
    // Generate guidance based on analysis
    if (analysis.understanding.tone === 'sarcastic') {
      parts.push(`- The tweet is sarcastic; match the tone appropriately or respond with light humor`);
    } else if (analysis.understanding.tone === 'humorous') {
      parts.push(
        `- The tweet is humorous; match the joke's energy with wit grounded in their wording—avoid generic praise unless they are clearly inviting applause`,
      );
    } else if (analysis.understanding.tone === 'informative') {
      parts.push(`- The tweet is informative; acknowledge the information or add relevant context`);
    } else if (analysis.understanding.tone === 'serious') {
      parts.push(`- The tweet is serious; respond thoughtfully and respectfully`);
    }
    
    if (analysis.understanding.sentiment === 'negative') {
      parts.push(`- The sentiment is negative; be empathetic and constructive`);
    } else if (analysis.understanding.sentiment === 'positive') {
      parts.push(`- The sentiment is positive; match the energy appropriately`);
    }

    // Safely check action verbs
    if (analysis.intention.actionVerbs && 
        (analysis.intention.actionVerbs.includes('asking') || analysis.intention.actionVerbs.includes('questioning'))) {
      parts.push(`- The user appears to be asking something; provide a helpful response`);
    }

    return parts.join('\n');
  }

  // Clear cache (useful for testing or manual cache invalidation)
  clearCache(): void {
    analysisCache.clear();
    console.log('[TweetAnalysisOrchestrator] Cache cleared');
  }

  // Get cache stats (useful for monitoring)
  getCacheStats(): { size: number; entries: number } {
    // Clean up expired entries
    for (const [key, entry] of analysisCache.entries()) {
      if (!isCacheValid(entry)) {
        analysisCache.delete(key);
      }
    }
    
    return {
      size: analysisCache.size,
      entries: analysisCache.size
    };
  }
}

// Export singleton instance
export const tweetAnalysisOrchestrator = new TweetAnalysisOrchestrator();

