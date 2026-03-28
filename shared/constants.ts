/**
 * Shared constants used by both server and client.
 * Plan limits (credits, replies) are the single source of truth for enforcement and display.
 * trial.credits is the trial limit for both server enforcement and client display.
 */

/** User-facing product name (emails, UI, meta). Keep `client/index.html` JSON-LD in sync when changing. */
export const APP_DISPLAY_NAME = 'TweetReplyAI';

export const PLAN_LIMITS = {
  trial: { credits: 10, replies: 10 },
  weekly: { credits: 100, replies: 700 },
  monthly: { credits: 10000, replies: 3000 },
} as const;

export const PLAN_PERIODS_DAYS = {
  weekly: 7,
  monthly: 30,
  trial: 7,
  daily: 1,
} as const;
