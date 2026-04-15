import { describe, expect, it } from "vitest";
import { deriveReplyUsageFromCredits } from "../../../shared/usage-breakdown";

describe("deriveReplyUsageFromCredits", () => {
  it("derives per-mode replies using configured credit costs", () => {
    const result = deriveReplyUsageFromCredits({
      "single-sentence": { credits: 5 },
      enhanced: { credits: 4 },
      improve: { credits: 3 },
    });

    expect(result.modeBreakdown["single-sentence"]).toEqual({ credits: 5, replies: 5 });
    expect(result.modeBreakdown.enhanced).toEqual({ credits: 4, replies: 2 });
    expect(result.modeBreakdown.improve).toEqual({ credits: 3, replies: 1 });
    expect(result.totalCredits).toBe(12);
    expect(result.totalReplies).toBe(8);
  });

  it("handles missing or invalid values defensively", () => {
    const result = deriveReplyUsageFromCredits({
      "single-sentence": { credits: -1 },
      enhanced: { credits: Number.NaN as unknown as number },
    });

    expect(result.modeBreakdown["single-sentence"]).toEqual({ credits: 0, replies: 0 });
    expect(result.modeBreakdown.enhanced).toEqual({ credits: 0, replies: 0 });
    expect(result.modeBreakdown.improve).toEqual({ credits: 0, replies: 0 });
    expect(result.totalCredits).toBe(0);
    expect(result.totalReplies).toBe(0);
  });
});
