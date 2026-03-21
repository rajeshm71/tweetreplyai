import { describe, expect, it } from "vitest";

// [SMOKE] T3 — import-only test; behavioral tests for computeFeedbackStats should be added
describe("[SMOKE] Feedback Analytics Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/feedback-analytics");
    expect(mod.feedbackAnalytics).toBeDefined();
  });
});

