/**
 * Shared constants used by both server and client.
 * Plan limits (credits, replies) are the single source of truth for enforcement and display.
 */
export const PLAN_LIMITS = {
  trial: { credits: 50, replies: 10 },
  weekly: { credits: 4000, replies: 700 },
  monthly: { credits: 20000, replies: 3000 },
} as const;

export const PLAN_PERIODS_DAYS = {
  weekly: 7,
  monthly: 30,
  trial: 7,
  daily: 1,
} as const;
