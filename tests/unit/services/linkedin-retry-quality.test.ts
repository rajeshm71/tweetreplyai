import { describe, expect, it } from "vitest";
import { shouldAcceptLinkedInRetryQuality } from "../../../server/services/linkedin-ai-service.js";
import type { LinkedInQualityResult } from "../../../server/services/linkedin-quality-checker.js";

function quality(partial: Partial<LinkedInQualityResult>): LinkedInQualityResult {
  return {
    passed: false,
    totalScore: 0,
    parameters: [],
    ...partial,
  };
}

describe("shouldAcceptLinkedInRetryQuality", () => {
  it("accepts retry when retry passes quality check", () => {
    const original = quality({ passed: false, totalScore: 80 });
    const retry = quality({ passed: true, totalScore: 90 });
    expect(shouldAcceptLinkedInRetryQuality(retry, original)).toBe(true);
  });

  it("rejects retry that still fails original_wording despite higher total score", () => {
    const original = quality({
      passed: false,
      totalScore: 100,
      parameters: [{ name: "original_wording", score: 0, maxScore: 20, reason: "rewrite" }],
    });
    const retry = quality({
      passed: false,
      totalScore: 110,
      parameters: [{ name: "original_wording", score: 0, maxScore: 20, reason: "rewrite" }],
    });
    expect(shouldAcceptLinkedInRetryQuality(retry, original)).toBe(false);
  });

  it("accepts retry when original_wording improved from fail to pass", () => {
    const original = quality({
      passed: false,
      totalScore: 100,
      parameters: [{ name: "original_wording", score: 0, maxScore: 20, reason: "rewrite" }],
    });
    const retry = quality({
      passed: false,
      totalScore: 105,
      parameters: [{ name: "original_wording", score: 20, maxScore: 20, reason: "ok" }],
    });
    expect(shouldAcceptLinkedInRetryQuality(retry, original)).toBe(true);
  });
});
