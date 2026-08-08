/**
 * Server-side constants. Single source of truth for AI, quality, validation, and analytics.
 */

import { getGroqTertiaryModel, getModelRoutingConfig, isModelRoutingEnabled } from "./model-routing.js";

function primaryRoutingModel(): string {
  if (!isModelRoutingEnabled()) {
    return "openai/gpt-oss-120b";
  }
  return getModelRoutingConfig().find((t) => t.id === "primary")?.model ?? "gpt-5-chat-latest";
}

/** Legacy OpenAI fallback when MODEL_ROUTING_ENABLED=false (pre-cascade behavior). */
export const LEGACY_OPENAI_FALLBACK = "gpt-4o-mini";

function secondaryRoutingModel(): string {
  // Review fix: rollback path must restore gpt-4o-mini, not tier-2 GPT-5.4 mini.
  if (!isModelRoutingEnabled()) {
    return LEGACY_OPENAI_FALLBACK;
  }
  return getModelRoutingConfig().find((t) => t.id === "secondary")?.model ?? "gpt-5.4-mini";
}

export const AI_MODELS = {
  /** Tier-1 when routing enabled; legacy Groq primary when disabled. */
  get DEFAULT(): string {
    return primaryRoutingModel();
  },
  /** Tier-2 OpenAI model (legacy FALLBACK alias). */
  get FALLBACK(): string {
    return secondaryRoutingModel();
  },
  ANALYSIS: "openai/gpt-oss-120b",
  GUARDRAIL: "openai/gpt-oss-safeguard-20b",
  /** Tier-3 Groq model for cascade terminus + guardrail friendly replies. */
  get GROQ_TERTIARY(): string {
    return getGroqTertiaryModel();
  },
};

export const AI_PARAMS = {
  TEMPERATURE: 0.7,
  GROQ_MAX_TOKENS: 1024,
  ANALYSIS_MAX_TOKENS_QUICK: 300,
  ANALYSIS_MAX_TOKENS_DEEP: 400,
  ANALYSIS_TEMPERATURE_QUICK: 0.3,
  ANALYSIS_TEMPERATURE_DEEP: 0.4,
  TOKEN_COST_DIVISOR: 1_000_000,
  TOKEN_ESTIMATION_CHARS_PER_TOKEN: 4,
} as const;

export const MODEL_SPECS = {
  GPT_4O_MINI: { inputCost: 0.15, outputCost: 0.6, contextWindow: 128000 },
  GPT_5_CHAT_LATEST: { inputCost: 2.5, outputCost: 15, contextWindow: 128000 },
  GPT_5_4_MINI: { inputCost: 0.375, outputCost: 2.25, contextWindow: 400000 },
  GPT_4_1_MINI: { inputCost: 0.4, outputCost: 1.6, contextWindow: 128000 },
  GPT_5_MINI: { inputCost: 0.25, outputCost: 2.0, contextWindow: 128000 },
  CODEX_MINI: { inputCost: 0.5, outputCost: 2.0, contextWindow: 128000 },
  GPT_5_1_CODEX_MINI: { inputCost: 0.5, outputCost: 2.0, contextWindow: 128000 },
  O1_MINI: { inputCost: 1.1, outputCost: 4.4, contextWindow: 128000 },
  O3_MINI: { inputCost: 1.1, outputCost: 4.4, contextWindow: 128000 },
  O4_MINI: { inputCost: 1.1, outputCost: 4.4, contextWindow: 128000 },
  GPT_OSS_120B: { inputCost: 0.15, outputCost: 0.75, contextWindow: 131072 },
  GUARDRAIL_SAFEGUARD: { inputCost: 0.075, outputCost: 0.3, contextWindow: 128000 },
} as const;

export const REPLY_LIMITS = {
  MAX_WORDS: 30,
  POST_PROCESSOR_MAX_WORDS: 50,
  POST_PROCESSOR_MIN_WORDS: 5,
  SINGLE_SENTENCE_MAX_WORDS: 20,
  MIN_TEXT_LENGTH_FOR_PROCESSING: 20,
  MIN_EXTRACTED_LENGTH: 10,
  MAX_LENGTH_REDUCTION_PERCENT: 0.5,
} as const;

/** OA: when viewer is original author, reply length is derived from comment length. Tune tiers here. */
export const OA_DYNAMIC_REPLY_TIERS = [
  { commentWordMax: 3, replyMinWords: 1, replyMaxWords: 5 },
  { commentWordMax: 8, replyMinWords: 6, replyMaxWords: 15 },
  { commentWordMax: 15, replyMinWords: 16, replyMaxWords: 25 },
  { commentWordMax: Infinity, replyMinWords: 26, replyMaxWords: 30 },
] as const;

export const LINKEDIN_REPLY_LIMITS = {
  MAX_WORDS: 80,
  POST_PROCESSOR_MAX_WORDS: 80,
  POST_PROCESSOR_MIN_WORDS: 5,
} as const;

export const QUALITY = {
  PASS_SCORE: 60,
  HIGH_SCORE: 80,
  TEMPLATE_SCORE: 70,
  LOW_PARAMETER_SCORE: 4,
} as const;

export const PERIODS = {
  MONTHLY_DAYS: 30,
  WEEKLY_DAYS: 7,
  DAILY_DAYS: 1,
  DEFAULT_ANALYTICS_DAYS: 30,
  ANALYTICS_RECENT_TRENDS_DAYS: 7,
} as const;

export const VALIDATION = {
  MIN_TWEET_LENGTH: 20,
  MAX_TWEET_LENGTH: 2000,
  MAX_DRAFT_LENGTH: 500,
  MAX_THREAD_CHAIN: 20,
  MAX_THREAD_INDEX: 20,
  FOLLOWER_HIGH_PROFILE_THRESHOLD: 100000,
} as const;

export const ANALYTICS = {
  DEFAULT_REPLY_HISTORY_LIMIT: 50,
  TEMPLATE_LIMIT: 20,
  TIME_SAVED_MINS_PER_REPLY: 4,
  UPVOTE_GOOD_THRESHOLD: 70,
  REGEN_RATE_BAD_THRESHOLD: 20,
  AVG_QUALITY_GOOD_THRESHOLD: 75,
} as const;

export const CACHE = {
  DEFAULT_TTL_SECONDS: 3600,
  MAX_SIZE: 1000,
  AGENT_TIMEOUT_MS: 10000,
  HASH_LENGTH: 8,
} as const;

export const WHITELIST = {
  EMAIL_RELOAD_INTERVAL_MS: 60000,
  LOW_CREDITS_WARNING_THRESHOLD: 10,
  DEFAULT_BYPASS_LIMIT: 10000,
  /** When true, whitelisted users see the model dropdown in the extension; when false, nobody sees it. */
  SHOW_MODEL_SELECT_FOR_WHITELIST: true,
} as const;

/** Rate limits for API (global and generate-reply). Trust proxy must be set so req.ip is correct. */
export const RATE_LIMIT = {
  GLOBAL_API_WINDOW_MS: 15 * 60 * 1000,
  GLOBAL_API_MAX: 200,
  GENERATE_REPLY_WINDOW_MS: 60 * 1000,
  GENERATE_REPLY_MAX: 30,
} as const;

/** Express body-parser limits (follower sync batches can exceed the default 100kb). */
export const HTTP = {
  JSON_BODY_LIMIT: '2mb',
} as const;
