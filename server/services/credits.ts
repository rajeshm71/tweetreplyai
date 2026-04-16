export const CREDIT_COSTS = {
  'single-sentence': 1,  // Concise
  'enhanced': 2,         // Enhanced (default)
  'improve': 2,          // Improve draft
  'reframe': 2,          // Reuse tweet (X extension reframer)
} as const;

export type ReplyMode = keyof typeof CREDIT_COSTS;

export function getCreditCost(replyMode?: string): number {
  if (!replyMode) return CREDIT_COSTS['enhanced'];
  return CREDIT_COSTS[replyMode as ReplyMode] ?? CREDIT_COSTS['enhanced'];
}

