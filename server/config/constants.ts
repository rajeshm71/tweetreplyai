/**
 * Server-side constants. Single source of truth for AI, quality, validation, and analytics.
 */

export const AI_MODELS = {
  DEFAULT: "meta-llama/llama-4-scout-17b-16e-instruct",
  FALLBACK: "gpt-4o-mini",
  ANALYSIS: "meta-llama/llama-4-scout-17b-16e-instruct",
  GUARDRAIL: "openai/gpt-oss-safeguard-20b",
} as const;

export const AI_PARAMS = {
  TEMPERATURE: 2.0,
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
  LLAMA_SCOUT: { inputCost: 0.11, outputCost: 0.34, contextWindow: 131072 },
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
  SHOW_MODEL_SELECT_FOR_WHITELIST: false,
} as const;
