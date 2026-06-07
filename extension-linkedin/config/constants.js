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

/** Reply mode options for comment bar dropdown (mirrors X extension). */
export const LI_REPLY_MODES = [
  { value: 'single-sentence', label: 'Concise', tooltip: 'Fast one-sentence reply' },
  { value: 'enhanced', label: 'Enhanced', tooltip: 'Context-aware with deep analysis' },
];

/** Tone/prompt options — keep in sync with popup.html prompt-select. */
export const LI_PROMPT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'professional', label: 'Professional' },
  { value: 'insightful', label: 'Insightful' },
  { value: 'conversational', label: 'Conversational' },
  { value: 'supportive', label: 'Supportive' },
  { value: 'direct', label: 'Direct' },
  { value: 'x_default', label: 'X Default', popupLabel: 'X Default (same as Twitter)' },
];

export const LI_STORAGE_KEYS = {
  REPLY_MODE: 'liReplyMode',
  PROMPT_VARIATION: 'liPromptVariation',
  MODEL_KEY: 'liReplyModel',
};

const VALID_REPLY_MODE_VALUES = new Set(LI_REPLY_MODES.map((m) => m.value));
const VALID_PROMPT_VALUES = new Set(LI_PROMPT_OPTIONS.map((p) => p.value));

/** Guard API payload against corrupted storage values. */
export function normalizeReplyMode(value) {
  if (typeof value === 'string' && VALID_REPLY_MODE_VALUES.has(value)) return value;
  return 'enhanced';
}

/** Guard API payload against corrupted storage values. */
export function normalizePromptVariation(value) {
  if (typeof value === 'string' && VALID_PROMPT_VALUES.has(value)) return value;
  return 'default';
}
