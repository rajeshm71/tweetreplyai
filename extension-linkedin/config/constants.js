/**
 * LinkedIn extension constants.
 */

export const API = {
  DEFAULT_DOMAIN: 'tweetreplyai.vercel.app',
  LOGIN_URL: 'https://tweetreplyai.vercel.app/login',
  TAB_PATTERN: 'https://tweetreplyai.vercel.app/*',
};

export const POLLING = {
  USAGE_REFRESH_MS: 30_000,
  URL_TRACKING_MS: 300,
};

export const TIMEOUTS = {
  USAGE_LOAD_MS: 10_000,
  AUTH_SYNC_DELAY_MS: 500,
  DOM_DEBOUNCE_MS: 150,
  BUTTON_THROTTLE_MS: 200,
  PLACEMENT_OBSERVER_MS: 200,
};

export const DEFAULTS = {
  ANALYTICS_DAYS: 30,
  REPLY_HISTORY_LIMIT: 50,
};

export const VALIDATION = {
  MIN_POST_LENGTH: 20,
  MAX_POST_LENGTH: 700,
};

export const AUTH = {
  TOKEN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
};

export const LINKEDIN = {
  PLATFORM: 'linkedin',
  MAX_REPLY_WORDS: 60,
};
