import { Groq } from "groq-sdk";
import crypto from "crypto";
import { AI_MODELS, AI_PARAMS, CACHE } from "../config/constants.js";

// Lazy-init to avoid Groq constructor work at module import time.
let groqClient: Groq | null | undefined;
function getGroqClient(): Groq | null {
  if (groqClient !== undefined) return groqClient;
  groqClient = process.env.GROQ_API_KEY ? new Groq() : null;
  return groqClient;
}
const LINKEDIN_ANALYSIS_ENABLED = process.env.LINKEDIN_ANALYSIS_ENABLED !== 'false';
const LINKEDIN_ANALYSIS_CACHE_TTL = parseInt(process.env.LINKEDIN_ANALYSIS_CACHE_TTL || String(CACHE.DEFAULT_TTL_SECONDS), 10);
const LINKEDIN_ANALYSIS_MODEL = AI_MODELS.ANALYSIS;

export interface LinkedInPostUnderstanding {
  tone: string;
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  style: string;
  contentType: 'thought_leadership' | 'question' | 'announcement' | 'personal_story' | 'industry_insight' | 'job_related' | 'other';
  emotionalMarkers: string[];
  keyThemes: string[];
}

export interface LinkedInIntentionResult {
  intention: string;
  keyThemes: string[];
  actionVerbs: string[];
  underlyingPurpose: string;
}

export interface LinkedInPostAnalysis {
  understanding: LinkedInPostUnderstanding;
  intention: LinkedInIntentionResult;
  enrichedContextPrompt: string;
  timestamp: Date;
}

interface CacheEntry {
  analysis: LinkedInPostAnalysis;
  timestamp: number;
}

const analysisCache = new Map<string, CacheEntry>();

function normalizeCacheKey(postText: string): string {
  const normalized = postText.toLowerCase().trim().replace(/\s+/g, ' ');
  const hash = crypto.createHash('md5').update(postText).digest('hex').substring(0, CACHE.HASH_LENGTH);
  return `linkedin|${normalized}|${hash}`;
}

function isCacheValid(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp < LINKEDIN_ANALYSIS_CACHE_TTL * 1000;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    )
  ]);
}

function getDefaultUnderstanding(): LinkedInPostUnderstanding {
  return {
    tone: 'neutral',
    sentiment: 'neutral',
    style: 'professional',
    contentType: 'other',
    emotionalMarkers: [],
    keyThemes: []
  };
}

function getDefaultIntention(): LinkedInIntentionResult {
  return {
    intention: 'The author is sharing professional content or insights',
    keyThemes: [],
    actionVerbs: [],
    underlyingPurpose: 'To engage with professional network'
  };
}

async function analyzeUnderstanding(postText: string): Promise<LinkedInPostUnderstanding> {
  const groq = getGroqClient();
  if (!groq) return getDefaultUnderstanding();

  try {
    const prompt = `Analyze this LinkedIn post's tone, sentiment, and content type.

LinkedIn Post: "${postText}"

Respond with a JSON object containing:
- tone: one word describing the primary tone (e.g., "authoritative", "reflective", "informative", "enthusiastic", "conversational", "analytical")
- sentiment: one of "positive", "negative", "neutral", or "mixed"
- style: one word describing the writing style (e.g., "professional", "conversational", "storytelling", "instructional", "opinion-driven")
- contentType: one of "thought_leadership", "question", "announcement", "personal_story", "industry_insight", "job_related", or "other"
- emotionalMarkers: array of 2-4 key emotional indicators or signals present in the post
- keyThemes: array of 2-5 main professional topics or themes mentioned

Return ONLY valid JSON, no additional text.`;

    const response = await groq.chat.completions.create({
      model: LINKEDIN_ANALYSIS_MODEL,
      messages: [
        { role: "system", content: "You are an expert at analyzing LinkedIn professional content. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_QUICK,
      max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_QUICK,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    const parsed = JSON.parse(content);
    const validContentTypes = ['thought_leadership', 'question', 'announcement', 'personal_story', 'industry_insight', 'job_related', 'other'];

    return {
      tone: parsed.tone || 'neutral',
      sentiment: ['positive', 'negative', 'neutral', 'mixed'].includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      style: parsed.style || 'professional',
      contentType: validContentTypes.includes(parsed.contentType) ? parsed.contentType : 'other',
      emotionalMarkers: Array.isArray(parsed.emotionalMarkers) ? parsed.emotionalMarkers : [],
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : []
    };
  } catch (error: any) {
    console.warn('[LinkedInAnalysis] Understanding analysis failed:', error.message);
    return getDefaultUnderstanding();
  }
}

async function analyzeIntention(postText: string): Promise<LinkedInIntentionResult> {
  const groq = getGroqClient();
  if (!groq) return getDefaultIntention();

  try {
    const prompt = `What is the author's underlying intention or purpose in this LinkedIn post?

LinkedIn Post: "${postText}"

Respond with a JSON object containing:
- intention: a 1-2 sentence description of what the author is trying to achieve or express (focus on professional context)
- keyThemes: array of 2-5 important professional themes related to this post
- actionVerbs: array of 2-4 action verbs that describe what the author is doing (e.g., "sharing", "questioning", "announcing", "advising", "reflecting")
- underlyingPurpose: a brief sentence describing the deeper professional purpose behind the post

Return ONLY valid JSON, no additional text.`;

    const response = await groq.chat.completions.create({
      model: LINKEDIN_ANALYSIS_MODEL,
      messages: [
        { role: "system", content: "You are an expert at understanding professional intentions on LinkedIn. Return only valid JSON." },
        { role: "user", content: prompt }
      ],
      temperature: AI_PARAMS.ANALYSIS_TEMPERATURE_DEEP,
      max_tokens: AI_PARAMS.ANALYSIS_MAX_TOKENS_DEEP,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('Empty response');

    const parsed = JSON.parse(content);
    return {
      intention: parsed.intention || 'The author is sharing professional content or insights',
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes : [],
      actionVerbs: Array.isArray(parsed.actionVerbs) ? parsed.actionVerbs : [],
      underlyingPurpose: parsed.underlyingPurpose || 'To engage with professional network'
    };
  } catch (error: any) {
    console.warn('[LinkedInAnalysis] Intention analysis failed:', error.message);
    return getDefaultIntention();
  }
}

function generateEnrichedContextPrompt(understanding: LinkedInPostUnderstanding, intention: LinkedInIntentionResult): string {
  const parts: string[] = [];

  parts.push('LinkedIn Post Analysis:');
  parts.push(`- Tone: ${understanding.tone}`);
  parts.push(`- Sentiment: ${understanding.sentiment}`);
  parts.push(`- Style: ${understanding.style}`);
  parts.push(`- Content type: ${understanding.contentType.replace(/_/g, ' ')}`);

  if (understanding.emotionalMarkers.length > 0) {
    parts.push(`- Emotional signals: ${understanding.emotionalMarkers.join(', ')}`);
  }

  if (understanding.keyThemes.length > 0) {
    parts.push(`- Key themes: ${understanding.keyThemes.join(', ')}`);
  }

  parts.push('');
  parts.push(`Author's Intention: ${intention.intention}`);

  if (intention.underlyingPurpose) {
    parts.push(`Underlying Purpose: ${intention.underlyingPurpose}`);
  }

  if (intention.actionVerbs.length > 0) {
    parts.push(`What the author is doing: ${intention.actionVerbs.join(', ')}`);
  }

  parts.push('');
  parts.push('Reply Guidance:');

  const contentTypeGuidance: Record<string, string> = {
    thought_leadership: 'This is a thought leadership post — engage with the idea, add your perspective, or offer a constructive counterpoint',
    question: 'The author is asking a question — provide a helpful, direct answer based on your experience',
    announcement: 'This is an announcement — acknowledge what was shared and respond to the substance',
    personal_story: 'This is a personal story — respond with empathy and genuine engagement',
    industry_insight: 'This is an industry insight — engage with the substance, add context, or share related experience',
    job_related: 'This is job-related content — respond professionally and constructively',
    other: 'Engage naturally with the professional content'
  };

  const guidance = contentTypeGuidance[understanding.contentType];
  if (guidance) parts.push(`- ${guidance}`);

  if (understanding.sentiment === 'negative') {
    parts.push('- The post has a negative or critical tone — be empathetic and constructive in your response');
  } else if (understanding.sentiment === 'positive') {
    parts.push('- The post is positive — match the constructive energy without being sycophantic');
  }

  if (intention.actionVerbs.includes('questioning') || intention.actionVerbs.includes('asking')) {
    parts.push('- The author is seeking input — give a direct, useful answer');
  }

  return parts.join('\n');
}

export const linkedInAnalysisAgents = {
  async analyzePost(postText: string): Promise<LinkedInPostAnalysis> {
    if (!postText || typeof postText !== 'string' || postText.trim().length === 0) {
      console.warn('[LinkedInAnalysis] Invalid post text');
      return {
        understanding: getDefaultUnderstanding(),
        intention: getDefaultIntention(),
        enrichedContextPrompt: '',
        timestamp: new Date()
      };
    }

    if (!LINKEDIN_ANALYSIS_ENABLED) {
      return {
        understanding: getDefaultUnderstanding(),
        intention: getDefaultIntention(),
        enrichedContextPrompt: '',
        timestamp: new Date()
      };
    }

    const cacheKey = normalizeCacheKey(postText);
    const cached = analysisCache.get(cacheKey);
    if (cached && isCacheValid(cached)) {
      console.log('[LinkedInAnalysis] Cache hit');
      return cached.analysis;
    }

    try {
      const [understanding, intention] = await Promise.all([
        withTimeout(analyzeUnderstanding(postText), CACHE.AGENT_TIMEOUT_MS, 'LinkedInUnderstanding'),
        withTimeout(analyzeIntention(postText), CACHE.AGENT_TIMEOUT_MS, 'LinkedInIntention')
      ]);

      const enrichedContextPrompt = generateEnrichedContextPrompt(understanding, intention);

      const analysis: LinkedInPostAnalysis = {
        understanding,
        intention,
        enrichedContextPrompt,
        timestamp: new Date()
      };

      if (analysisCache.size >= CACHE.MAX_SIZE) {
        const firstKey = analysisCache.keys().next().value;
        if (firstKey) analysisCache.delete(firstKey);
      }

      analysisCache.set(cacheKey, { analysis, timestamp: Date.now() });
      console.log(`[LinkedInAnalysis] Analysis complete — tone: ${understanding.tone}, type: ${understanding.contentType}`);

      return analysis;
    } catch (error: any) {
      console.error('[LinkedInAnalysis] Error:', error.message);
      return {
        understanding: getDefaultUnderstanding(),
        intention: getDefaultIntention(),
        enrichedContextPrompt: '',
        timestamp: new Date()
      };
    }
  }
};
