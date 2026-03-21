import { describe, expect, it } from "vitest";
import { linkedInQualityChecker } from "../../../server/services/linkedin-quality-checker";

// A long-enough generic postText used in cases where substance overlap is not being tested
const GENERIC_POST = "Leadership requires listening, adapting, and continuously learning from those around you.";

describe("LinkedIn Quality Checker Service - Unit Tests", () => {
  describe("result shape", () => {
    it("returns correct shape: { passed, totalScore, parameters }", () => {
      const result = linkedInQualityChecker.checkQuality("Some reply here", GENERIC_POST);
      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("totalScore");
      expect(result).toHaveProperty("parameters");
      expect(Array.isArray(result.parameters)).toBe(true);
    });

    it("passed is boolean and totalScore is a number", () => {
      const result = linkedInQualityChecker.checkQuality("A professional reply", GENERIC_POST);
      expect(typeof result.passed).toBe("boolean");
      expect(typeof result.totalScore).toBe("number");
    });
  });

  describe("passing a clean professional reply", () => {
    it("passes a substantive reply that meets all five criteria", () => {
      const reply =
        "The shift to async workflows requires rethinking team cadences and building explicit communication norms. Documenting decisions as they happen, not after, is what makes distributed teams actually work.";
      const result = linkedInQualityChecker.checkQuality(reply, GENERIC_POST);
      expect(result.passed).toBe(true);
    });
  });

  describe("cliche language detection (no_cliche_language)", () => {
    it("penalises a reply containing LinkedIn buzzwords like 'leverage' and 'synergies'", () => {
      const reply =
        "We need to leverage our core competencies and synergies to drive impact at scale.";
      const result = linkedInQualityChecker.checkQuality(reply, GENERIC_POST);
      const clicheParam = result.parameters.find((p) => p.name === "no_cliche_language");
      expect(clicheParam).toBeDefined();
      expect(clicheParam!.score).toBeLessThan(20);
    });
  });

  describe("hollow opener detection (no_hollow_opener)", () => {
    it("penalises a reply that starts with 'Great post!'", () => {
      const reply = "Great post! Really insightful content here about leadership.";
      const result = linkedInQualityChecker.checkQuality(reply, GENERIC_POST);
      const hollowParam = result.parameters.find((p) => p.name === "no_hollow_opener");
      expect(hollowParam).toBeDefined();
      expect(hollowParam!.score).toBeLessThan(20);
    });

    it("penalises a reply that starts with 'Amazing post'", () => {
      const reply = "Amazing post and very useful perspective on the topic.";
      const result = linkedInQualityChecker.checkQuality(reply, GENERIC_POST);
      const hollowParam = result.parameters.find((p) => p.name === "no_hollow_opener");
      expect(hollowParam!.score).toBeLessThan(20);
    });
  });

  describe("meta-commentary detection (no_meta_commentary)", () => {
    it("penalises a reply that contains 'here is a reply to your post'", () => {
      const reply = "Here is a reply to your post about leadership and teamwork.";
      const result = linkedInQualityChecker.checkQuality(reply, GENERIC_POST);
      const metaParam = result.parameters.find((p) => p.name === "no_meta_commentary");
      expect(metaParam).toBeDefined();
      expect(metaParam!.score).toBeLessThanOrEqual(20);
    });
  });

  describe("word count (word_count)", () => {
    it("penalises a reply shorter than the minimum word count", () => {
      // 'Good point' is definitely below any reasonable MIN_WORDS threshold
      const result = linkedInQualityChecker.checkQuality("Good point.", GENERIC_POST);
      const wordParam = result.parameters.find((p) => p.name === "word_count");
      expect(wordParam).toBeDefined();
      expect(wordParam!.score).toBeLessThan(20);
    });
  });

  describe("substance parameter (substance)", () => {
    it("penalises a reply that copies more than 60% of the post's words verbatim", () => {
      // Near-verbatim copy — should have high word overlap
      const post = "Leadership requires listening adapting and continuously learning from those around you every day";
      const reply = "Leadership requires listening adapting and continuously learning from those around you";
      const result = linkedInQualityChecker.checkQuality(reply, post);
      const substanceParam = result.parameters.find((p) => p.name === "substance");
      expect(substanceParam).toBeDefined();
      expect(substanceParam!.score).toBeLessThan(20);
    });
  });
});
