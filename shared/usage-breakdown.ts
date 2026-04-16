export const REPLY_MODE_COSTS = {
  "single-sentence": 1,
  enhanced: 2,
  improve: 2,
  reframe: 2,
} as const;

export type ReplyModeKey = keyof typeof REPLY_MODE_COSTS;

export type CreditsOnlyBreakdown = Partial<Record<ReplyModeKey, { credits?: number }>>;

export type DerivedModeBreakdown = Partial<Record<ReplyModeKey, { credits: number; replies: number }>>;

export interface DerivedReplyUsage {
  modeBreakdown: DerivedModeBreakdown;
  totalCredits: number;
  totalReplies: number;
}

function toNonNegativeInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export function deriveReplyUsageFromCredits(
  breakdown: CreditsOnlyBreakdown | null | undefined,
): DerivedReplyUsage {
  const result: DerivedReplyUsage = {
    modeBreakdown: {},
    totalCredits: 0,
    totalReplies: 0,
  };

  const source = breakdown ?? {};
  (Object.keys(REPLY_MODE_COSTS) as ReplyModeKey[]).forEach((mode) => {
    const credits = toNonNegativeInt(source[mode]?.credits);
    const replies = Math.floor(credits / REPLY_MODE_COSTS[mode]);
    result.modeBreakdown[mode] = { credits, replies };
    result.totalCredits += credits;
    result.totalReplies += replies;
  });

  return result;
}
