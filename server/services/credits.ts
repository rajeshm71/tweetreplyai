export const CREDIT_COSTS = {
  'single-sentence': 1,  // Concise
  'enhanced': 2,         // Enhanced (default)
  'improve': 2,          // Improve draft
} as const;

export type ReplyMode = keyof typeof CREDIT_COSTS;

export function getCreditCost(replyMode?: string): number {
  if (!replyMode) return CREDIT_COSTS['enhanced'];
  return CREDIT_COSTS[replyMode as ReplyMode] ?? CREDIT_COSTS['enhanced'];
}

