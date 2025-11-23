export const CREDIT_COSTS = {
  'single-sentence': 1,  // Concise
  'base': 2,             // Balanced (default)
  'enhanced': 3,         // Enhanced
} as const;

export type ReplyMode = keyof typeof CREDIT_COSTS;

export function getCreditCost(replyMode?: string): number {
  if (!replyMode) return CREDIT_COSTS.base; // Default to Balanced
  return CREDIT_COSTS[replyMode as ReplyMode] || CREDIT_COSTS.base;
}

