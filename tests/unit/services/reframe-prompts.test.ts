import { describe, expect, it } from "vitest";
import {
  buildNumberRules,
  buildOriginalityRules,
  getDegreeBand,
  getReframePromptConfig,
} from "../../../server/services/reframe-prompts";

describe("reframe-prompts Service - Unit Tests", () => {
  describe("getDegreeBand boundaries", () => {
    it("maps 0-20 to minimal", () => {
      expect(getDegreeBand(0)).toBe("minimal");
      expect(getDegreeBand(20)).toBe("minimal");
    });

    it("maps 21-40 to light", () => {
      expect(getDegreeBand(21)).toBe("light");
      expect(getDegreeBand(40)).toBe("light");
    });

    it("maps 41-60 to balanced", () => {
      expect(getDegreeBand(50)).toBe("balanced");
      expect(getDegreeBand(60)).toBe("balanced");
    });

    it("maps 61-80 to heavy", () => {
      expect(getDegreeBand(75)).toBe("heavy");
    });

    it("maps 81-100 to reimagined", () => {
      expect(getDegreeBand(95)).toBe("reimagined");
    });
  });

  describe("insight-first prompt content", () => {
    it("includes INSIGHT_SHARPENING and DEFAULT_VOICE at every degree", () => {
      for (const d of [10, 35, 50, 75, 95]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toMatch(/Insight first:/i);
        expect(sys).toMatch(/Default voice \(always on\)/i);
        expect(sys).toMatch(/plain everyday language/i);
      }
    });

    it("includes originality rules scaled by band", () => {
      expect(getReframePromptConfig(50).systemPrompt).toMatch(/balanced:/i);
      expect(getReframePromptConfig(75).systemPrompt).toMatch(/heavy:/i);
      expect(getReframePromptConfig(95).systemPrompt).toMatch(/reimagined:/i);
      expect(getReframePromptConfig(15).systemPrompt).not.toMatch(/\nbalanced:/i);
    });

    it("appends retry boost when retryBoost is true", () => {
      const cfg = getReframePromptConfig(50, { retryBoost: true });
      expect(cfg.systemPrompt).toMatch(/RETRY — prior draft was too similar/i);
    });

    it("user prompt includes insight checklist", () => {
      const prompt = getReframePromptConfig(50).userPrompt("Example source tweet");
      expect(prompt).toMatch(/Core insight:/i);
      expect(prompt).toMatch(/Tweet shape:/i);
      expect(prompt).toMatch(/never copy verbatim/i);
      expect(prompt).toMatch(/Degree: 50\/100/i);
    });
  });

  describe("buildNumberRules", () => {
    it("preserves all numbers at minimal/light", () => {
      expect(buildNumberRules("minimal")).toMatch(/preserve ALL numbers exactly/i);
      expect(buildNumberRules("light")).toMatch(/preserve ALL numbers exactly/i);
    });

    it("allows illustrative swaps at reimagined", () => {
      expect(buildNumberRules("reimagined")).toMatch(/SHOULD swap illustrative numbers/i);
    });
  });

  describe("buildOriginalityRules", () => {
    it("always forbids verbatim opening and 8-word spans", () => {
      for (const band of ["minimal", "balanced", "heavy", "reimagined"] as const) {
        const rules = buildOriginalityRules(band);
        expect(rules).toMatch(/8\+ words/i);
        expect(rules).toMatch(/opening line verbatim/i);
      }
    });
  });

  describe("getReframePromptConfig shared rules", () => {
    it("minimal band contains anti-plagiarism floor", () => {
      const cfg = getReframePromptConfig(15);
      expect(cfg.band).toBe("minimal");
      expect(cfg.systemPrompt).toMatch(/8\+ words/i);
      expect(cfg.systemPrompt).toMatch(/MINIMAL rewrite/i);
    });

    it("allowLong raises char limit to 4000", () => {
      expect(getReframePromptConfig(50).systemPrompt).toContain("280 characters");
      expect(getReframePromptConfig(50, { allowLong: true }).systemPrompt).toContain(
        "4000 characters",
      );
    });

    it("includes lead-question preservation at every degree", () => {
      for (const d of [0, 50, 100]) {
        expect(getReframePromptConfig(d).systemPrompt).toMatch(/Lead question \(when applicable\)/i);
      }
    });
  });
});
