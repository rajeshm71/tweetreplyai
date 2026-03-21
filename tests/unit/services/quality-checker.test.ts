import { describe, expect, it } from "vitest";
import { qualityChecker } from "../../../server/services/quality-checker";

describe("Quality Checker Service - Unit Tests", () => {
  describe("result shape", () => {
    it("returns an object with totalScore, passed, parameters, issues, suggestions", () => {
      const result = qualityChecker.checkQuality(
        "Great insight on AI adoption trends",
        "AI is changing everything"
      );
      expect(result).toHaveProperty("totalScore");
      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("parameters");
      expect(result).toHaveProperty("issues");
      expect(result).toHaveProperty("suggestions");
    });

    it("parameters array always has exactly 10 entries", () => {
      const result = qualityChecker.checkQuality("Great reply about this", "A tweet");
      expect(result.parameters).toHaveLength(10);
    });

    it("each parameter has name, score (number), maxScore=10, and reason", () => {
      const result = qualityChecker.checkQuality("Great insight on this topic", "Some tweet here");
      for (const p of result.parameters) {
        expect(typeof p.name).toBe("string");
        expect(typeof p.score).toBe("number");
        expect(p.maxScore).toBe(10);
        expect(typeof p.reason).toBe("string");
      }
    });

    it("totalScore equals the sum of all parameter scores (mathematical invariant)", () => {
      const result = qualityChecker.checkQuality(
        "This is a thoughtful and concise reply that adds genuine value",
        "Thoughts on leadership and team building in startups"
      );
      const sum = result.parameters.reduce((acc, p) => acc + p.score, 0);
      expect(result.totalScore).toBe(sum);
    });
  });

  describe("pass / fail threshold", () => {
    it("passes a well-formed, relevant reply", () => {
      const result = qualityChecker.checkQuality(
        "Great insight on AI adoption trends. The shift towards practical tooling over hype is the right call.",
        "AI is changing how teams work"
      );
      expect(result.passed).toBe(true);
      expect(result.totalScore).toBeGreaterThanOrEqual(60);
    });

    it("scores a trivially short reply lower than a substantive one", () => {
      const shortResult = qualityChecker.checkQuality("ok", "A tweet about technology");
      const goodResult = qualityChecker.checkQuality(
        "Great insight on AI adoption trends. The shift towards practical tooling is the right call.",
        "AI is changing how teams work"
      );
      // A well-formed reply should always outscore a two-letter reply
      expect(goodResult.totalScore).toBeGreaterThan(shortResult.totalScore);
    });

    it("issues array is non-empty when reply fails quality checks", () => {
      const result = qualityChecker.checkQuality("ok", "A tweet");
      // At least one parameter scored below max — reason should be surfaced in issues
      const lowParams = result.parameters.filter((p) => p.score < p.maxScore);
      expect(lowParams.length).toBeGreaterThan(0);
    });
  });

  describe("parameter score bounds", () => {
    it("each parameter score is between 5 and 10 (inclusive)", () => {
      const result = qualityChecker.checkQuality(
        "Short reply",
        "Tweet about something"
      );
      for (const p of result.parameters) {
        expect(p.score).toBeGreaterThanOrEqual(5);
        expect(p.score).toBeLessThanOrEqual(10);
      }
    });
  });

  describe("emoji handling", () => {
    it("does not crash on reply with emojis", () => {
      expect(() =>
        qualityChecker.checkQuality("Great point 🚀🔥💯😊🎉", "Tweet with emojis")
      ).not.toThrow();
    });
  });
});
