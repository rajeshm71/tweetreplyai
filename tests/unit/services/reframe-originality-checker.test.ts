import { describe, expect, it } from "vitest";
import {
  checkReframeOriginality,
  longestSharedWordSpan,
} from "../../../server/services/reframe-originality-checker";

describe("reframe-originality-checker", () => {
  it("detects 8+ word contiguous spans", () => {
    const source = "one two three four five six seven eight nine ten";
    const output = "prefix one two three four five six seven eight suffix";
    expect(longestSharedWordSpan(source, output)).toBe(8);
    const result = checkReframeOriginality(source, output, "balanced");
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.startsWith("longest_shared"))).toBe(true);
  });

  it("fails verbatim opening at any band", () => {
    const source = "Why is learning TypeScript worth it?\nHere are three reasons.";
    const output = "Why is learning TypeScript worth it?\nDifferent body line here.";
    const result = checkReframeOriginality(source, output, "heavy");
    expect(result.passed).toBe(false);
    expect(result.issues).toContain("verbatim_opening");
  });

  it("passes when opening is rephrased and body is fresh at balanced", () => {
    const source =
      "Why is learning TypeScript worth the investment for web developers in 2026?";
    const output =
      "What makes TypeScript a smart bet for frontend engineers this year?";
    const result = checkReframeOriginality(source, output, "balanced");
    expect(result.passed).toBe(true);
    expect(result.originalityScore).toBeGreaterThan(50);
  });

  it("minimal/light only fail on span and verbatim opening", () => {
    const source = "This is a short hook\nLine two about productivity tips.";
    const output = "This is a short hook\nLine two about productivity tips.";
    const minimal = checkReframeOriginality(source, output, "minimal");
    expect(minimal.passed).toBe(false);
    expect(minimal.issues).toContain("verbatim_opening");
  });

  it("returns higher originalityScore for more distinct output", () => {
    const source = "Five ways to write better hooks for your startup tweets today.";
    const nearCopy = "Five ways to write better hooks for your startup tweets now.";
    const fresh =
      "Hook writing for founders: four patterns that stop the scroll without clickbait.";
    const near = checkReframeOriginality(source, nearCopy, "heavy");
    const distinct = checkReframeOriginality(source, fresh, "heavy");
    expect(distinct.originalityScore).toBeGreaterThan(near.originalityScore);
  });

  // Golden fixtures from plan Step 11 — deterministic pass/fail at target degrees.
  describe("golden fixtures", () => {
    it("near-copy paraphrase at heavy (75) fails originality", () => {
      const source =
        "Why is learning TypeScript worth the investment for web developers in 2026?";
      const nearCopy =
        "Why is learning TypeScript worth the investment for web developers in 2026 today?";
      const result = checkReframeOriginality(source, nearCopy, "heavy");
      expect(result.passed).toBe(false);
    });

    it("same insight with new hook at balanced (50) passes", () => {
      const source =
        "Why is learning TypeScript worth the investment for web developers in 2026?";
      const freshHook =
        "What makes TypeScript a smart bet for frontend engineers this year?";
      const result = checkReframeOriginality(source, freshHook, "balanced");
      expect(result.passed).toBe(true);
    });

    it("list tweet with reordered/rephrased lines at heavy (75) passes", () => {
      const source = [
        "Five tips for better hooks:",
        "Lead with tension",
        "Use plain words",
        "Cut the fluff",
        "End with a question",
      ].join("\n");
      const reordered = [
        "Hook checklist for founders:",
        "Open with a gap they feel",
        "Skip jargon",
        "Trim filler lines",
        "Close with curiosity",
      ].join("\n");
      const result = checkReframeOriginality(source, reordered, "heavy");
      expect(result.passed).toBe(true);
    });
  });
});
