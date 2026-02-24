/**
 * Extension-side constants for API URLs, polling, timeouts, and validation.
 */

export const API = {
  DEFAULT_DOMAIN: 'tweetreplyai.vercel.app',
  LOGIN_URL: 'https://tweetreplyai.vercel.app/login',
  TAB_PATTERN: 'https://tweetreplyai.vercel.app/*',
};

export const POLLING = {
  USAGE_REFRESH_MS: 30_000,
  ANALYTICS_REFRESH_MS: 30_000,
  URL_TRACKING_MS: 300,
  TRACKING_CLEANUP_MS: 60_000,
};

export const TIMEOUTS = {
  USAGE_LOAD_MS: 10_000,
  AUTH_SYNC_DELAY_MS: 500,
  DOM_DEBOUNCE_MS: 100,
  BUTTON_THROTTLE_MS: 200,
  PLACEMENT_OBSERVER_MS: 150,
};

export const DEFAULTS = {
  ANALYTICS_DAYS: 30,
  TRACKING_DAYS: 7,
  TRACKING_DAYS_MIN: 1,
  TRACKING_DAYS_MAX: 30,
  REPLY_HISTORY_LIMIT: 50,
};

export const VALIDATION = {
  MIN_TWEET_LENGTH: 20,
  MAX_TWEET_LENGTH: 500,
  MAX_THREAD_CHAIN: 4,
  MAX_THREAD_CHARS: 2000,
};

export const AUTH = {
  TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
};
