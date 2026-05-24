import { describe, expect, it } from "vitest";
import {
  checkReframeQuality,
  normalizeReframeQualityScore,
  REFRAME_QUALITY_RAW_MAX,
} from "../../../server/services/reframe-quality-checker";

describe("reframe-quality-checker", () => {
  it("normalizes raw 0–40 scores to 0–100 for API parity", () => {
    expect(normalizeReframeQualityScore(28)).toBe(70);
    expect(normalizeReframeQualityScore(REFRAME_QUALITY_RAW_MAX)).toBe(100);
    expect(normalizeReframeQualityScore(0)).toBe(0);
  });

  it("scores mid overlap as good insight alignment", () => {
    const source = "Why is learning TypeScript worth the investment for web devs?";
    const output = "TypeScript pays off for web devs when types catch bugs early.";
    const result = checkReframeQuality(source, output, "balanced");
    expect(result.totalScore).toBeGreaterThan(50);
    expect(result.totalScore).toBeLessThanOrEqual(100);
    expect(result.originalityScore).toBeGreaterThan(0);
    expect(result.parameters.some((p) => p.name === "Insight alignment")).toBe(true);
    expect(result.parameters.some((p) => p.name === "Originality")).toBe(true);
  });

  it("includes originality from checker in response", () => {
    const source = "Ten clients at two thousand a month is already real revenue.";
    const output = "Eight clients paying two grand monthly is meaningful MRR.";
    const result = checkReframeQuality(source, output, "heavy");
    expect(result.originality).toBeDefined();
    expect(result.originalityScore).toBe(result.originality.originalityScore);
  });
});
