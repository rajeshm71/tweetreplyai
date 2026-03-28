/**
 * Impression Boost extension — auto-refresh constants.
 * Storage keys use "ib" prefix to avoid collision with other extensions
 * (e.g. TweetReply AI uses "x" prefix).
 */

export const AUTO_REFRESH = {
  CONFIG_VERSION: 2,

  STORAGE_KEYS: {
    enabled:             'ibAutoRefreshEnabled',
    urlPrefix:           'ibAutoRefreshUrlPrefix',
    shortDelayMinSec:    'ibAutoRefreshShortDelayMinSec',
    shortDelayMaxSec:    'ibAutoRefreshShortDelayMaxSec',
    longPauseMinSec:     'ibAutoRefreshLongPauseMinSec',
    longPauseMaxSec:     'ibAutoRefreshLongPauseMaxSec',
    reloadBurstMin:      'ibAutoRefreshReloadBurstMin',
    reloadBurstMax:      'ibAutoRefreshReloadBurstMax',
    reloadsDoneInBurst:  'ibAutoRefreshReloadsDoneInBurst',
    currentBurstTargetN: 'ibAutoRefreshCurrentBurstTargetN',
    configVersion:       'ibAutoRefreshConfigVersion',
    readingSimEnabled:   'ibReadingSimEnabled',
    readingIntervalMin:  'ibReadingIntervalMin',
    readingIntervalMax:  'ibReadingIntervalMax',
    reloadsSinceReading: 'ibReloadsSinceReading',
    readingThresholdN:   'ibReadingThresholdN',
  },

  DEFAULTS: {
    shortDelayMinSec: 1,
    shortDelayMaxSec: 10,
    longPauseMinSec:  120,
    longPauseMaxSec:  180,
    reloadBurstMin:   5,
    reloadBurstMax:   20,
    readingSimEnabled:  true,
    readingIntervalMin: 10,
    readingIntervalMax: 10,
  },

  LIMITS: {
    shortDelayMinSec: 1,
    shortDelayMaxSec: 600,
    longPauseMinSec:  30,
    longPauseMaxSec:  3600,
    reloadBurstMin:   1,
    reloadBurstMax:   200,
    readingIntervalMin: 1,
    readingIntervalMax: 200,
  },

  /** Flip to true locally to verbose-log scheduler steps in content script. */
  DEBUG: false,
};

/** All storage keys as a flat array — use with chrome.storage.local.get(). */
export const AUTO_REFRESH_STORAGE_QUERY_KEYS = Object.values(AUTO_REFRESH.STORAGE_KEYS);

/**
 * Uniform random integer in [min, max] inclusive.
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function randomIntInclusive(min, max) {
  const a = Math.ceil(Number(min));
  const b = Math.floor(Number(max));
  if (b < a) return a;
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
