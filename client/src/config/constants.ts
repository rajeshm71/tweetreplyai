/**
 * Client-side constants for URLs, polling, UI timing, and input limits.
 */

export const APP_URLS = {
  CHROME_STORE:
    "https://chromewebstore.google.com/detail/tweetreply-ai-powered-twi/nhpilcnghmcdhcbhndmemiggfekmdgem",
  BASE_URL: "https://tweetreplyai.com",
  X_COM: "https://x.com",
} as const;

export const X_PLATFORM_LABEL = "X.com" as const;

export const POLLING = {
  USAGE_REFETCH_INTERVAL_MS: 30_000,
  STATS_STALE_TIME_MS: 60 * 60 * 1000,
} as const;

export const UI = {
  COPY_FEEDBACK_DURATION_MS: 1500,
  REDIRECT_DELAY_MS: 500,
  LANDING_DEMO_DELAY_MS: 800,
  LANDING_EXAMPLE_CYCLE_MS: 5000,
  TESTIMONIAL_AUTOPLAY_MS: 5000,
} as const;

export const QUALITY_THRESHOLDS = {
  HIGH: 80,
  MEDIUM: 60,
  IMPROVE_FEATURE: 70,
} as const;

export const INPUT_LIMITS = {
  MAX_TWEET_TEXT: 1000,
  MAX_DRAFT_REPLY: 500,
} as const;
