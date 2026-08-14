import { describe, expect, it } from "vitest";
import {
  checkReframeQuality,
  normalizeReframeQualityScore,
  REFRAME_QUALITY_RAW_MAX,
} from "../../../server/services/reframe-quality-checker";

describe("reframe-quality-checker", () => {
  it("normalizes raw 0–50 scores to 0–100 for API parity", () => {
    expect(normalizeReframeQualityScore(35)).toBe(70);
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

  it("fails structure when output collapses a multiline list source", () => {
    const source = "Tips:\n- Ship fast\n- Talk to users\n- Iterate daily";
    const output =
      "Tips: ship fast, talk to users, and iterate daily so you keep momentum on the product.";
    const result = checkReframeQuality(source, output, "balanced");
    expect(result.structurePassed).toBe(false);
    expect(result.passed).toBe(false);
    expect(result.parameters.some((p) => p.name === "Tweet scannability")).toBe(true);
  });

  it("passes structure for multiline tweet-style output", () => {
    const source = "Tips:\n- Ship fast\n- Talk to users\n- Iterate daily";
    const output = "Quick tips:\n• Ship fast\n• Talk to users\n• Iterate daily";
    const result = checkReframeQuality(source, output, "balanced");
    expect(result.structurePassed).toBe(true);
  });

  it("does not penalize length over 4000 when allowLong is true", () => {
    const source = "A long source tweet about shipping product and talking to users every week.";
    const output = `${"Shipping well means talking to customers and landing tiny diffs. ".repeat(80)}Fresh wording throughout.`;
    expect(output.length).toBeGreaterThan(4000);
    const result = checkReframeQuality(source, output, "balanced", true);
    const lengthParam = result.parameters.find((p) => p.name === "Length fit");
    expect(lengthParam?.score).toBe(10);
    expect(lengthParam?.reason).toMatch(/no product character cap/i);
  });

  it("still penalizes over-280 length when allowLong is false", () => {
    const source = "A source tweet about shipping product and talking to users every week.";
    const output = `${"Shipping well means talking to customers and landing tiny diffs. ".repeat(8)}Fresh wording.`;
    expect(output.length).toBeGreaterThan(280);
    const result = checkReframeQuality(source, output, "balanced", false);
    const lengthParam = result.parameters.find((p) => p.name === "Length fit");
    expect(lengthParam?.score).toBe(3);
  });

  it("treats collapsed output as structure-pass when guidance is present", () => {
    const source = "Tips:\n- Ship fast\n- Talk to users\n- Iterate daily";
    const output =
      "Tips: ship fast, talk to users, and iterate daily so you keep momentum on the product.";
    const result = checkReframeQuality(source, output, "balanced", false, true);
    expect(result.structurePassed).toBe(true);
  });
});
