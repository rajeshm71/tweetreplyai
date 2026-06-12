/**
 * Extension-side constants for API URLs, polling, timeouts, and validation.
 */

/** Public product label — keep in sync with shared/constants.ts `APP_DISPLAY_NAME`. */
export const APP_DISPLAY_NAME = 'TweetReplyAI';

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
  TELEMETRY_FLUSH_DEBOUNCE_MS: 4_000,
  /** Auto-like: poll interval and max wait after Reply open (bounded retry vs one-shot 50ms). */
  AUTO_LIKE_POLL_MS: 100,
  AUTO_LIKE_MAX_WAIT_MS: 2000,
};

export const DEFAULTS = {
  ANALYTICS_DAYS: 30,
  TRACKING_DAYS: 7,
  TRACKING_DAYS_MIN: 1,
  TRACKING_DAYS_MAX: 30,
  REPLY_HISTORY_LIMIT: 50,
  TELEMETRY_MAX_BUFFER: 100,
  TELEMETRY_DEDUPE_WINDOW_MS: 10_000,
  SNIPPET_LIBRARY_LIMIT: 20,
  SNIPPET_MAX_LENGTH: 500,
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

/** chrome.storage.sync keys (cross-device when user syncs Chrome). */
export const STORAGE = {
  RELATIONSHIP_HINTS_ENABLED: 'relationshipHintsEnabled',
  FOLLOW_BADGE_ICON_STYLE: 'followBadgeIconStyle',
  FOLLOWER_COUNT_BADGE_ENABLED: 'followerCountBadgeEnabled',
};

/** Preset keys for relationship hint pills on X (follow / doesn't follow). */
export const FOLLOW_BADGE_ICON_STYLE = {
  TEXT: 'text',
  EMOJI: 'emoji',
  ICON_ONLY: 'icon_only',
};

export const FOLLOW_BADGE_ICON_STYLE_DEFAULT = FOLLOW_BADGE_ICON_STYLE.TEXT;

export const FOLLOW_BADGE_ICON_STYLE_VALUES = [
  FOLLOW_BADGE_ICON_STYLE.TEXT,
  FOLLOW_BADGE_ICON_STYLE.EMOJI,
  FOLLOW_BADGE_ICON_STYLE.ICON_ONLY,
];

/** chrome.storage.local keys for reply CTA / signature snippet (X extension). */
export const CTA_STORAGE = {
  TEXT: 'tweetreply_cta_text',
  AUTO_APPEND: 'tweetreply_cta_auto_append',
};

/** chrome.storage.local keys for snippet library migration and usage. */
export const SNIPPET_STORAGE = {
  LIBRARY: 'tweetreply_snippet_library',
  DEFAULT_ID: 'tweetreply_snippet_default_id',
  AUTO_APPEND_ID: 'tweetreply_snippet_auto_append_id',
  MIGRATED: 'tweetreply_snippet_migrated_v1',
};

/**
 * Constants for the "Reuse tweet" feature (content-script button on X + modal +
 * POST /api/reframe-tweet). Single source of truth on the extension side.
 */
export const REUSE = {
  BUTTON_CLASS: 'tweetreply-reuse-button',
  BUTTON_TITLE: 'Reuse this tweet with AI',
  MODAL_ID: 'tweetreply-reuse-modal',
  MODAL_Z_INDEX: 100_000,
  DEFAULT_DEGREE: 50,
  MIN_SOURCE_LEN: 20,
  TWITTER_CHAR_LIMIT: 280,
  LONG_TWEET_CHAR_LIMIT: 4000,
  COMPOSE_URL_PATH: '/compose/post',
  COMPOSE_POLL_MS: 100,
  COMPOSE_POLL_TIMEOUT_MS: 3000,
  DEGREE_BANDS: [
    { max: 20, label: 'Minimal' },
    { max: 40, label: 'Light' },
    { max: 60, label: 'Balanced' },
    { max: 80, label: 'Heavy' },
    { max: 100, label: 'Reimagined' },
  ],
};
