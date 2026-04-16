import { describe, expect, it } from "vitest";
import {
  getDegreeBand,
  getReframePromptConfig,
} from "../../../server/services/reframe-prompts";

describe("reframe-prompts Service - Unit Tests", () => {
  describe("getDegreeBand boundaries", () => {
    it("maps 0-20 to minimal", () => {
      expect(getDegreeBand(0)).toBe("minimal");
      expect(getDegreeBand(1)).toBe("minimal");
      expect(getDegreeBand(20)).toBe("minimal");
    });

    it("maps 21-40 to light", () => {
      expect(getDegreeBand(21)).toBe("light");
      expect(getDegreeBand(30)).toBe("light");
      expect(getDegreeBand(40)).toBe("light");
    });

    it("maps 41-60 to balanced (default-range)", () => {
      expect(getDegreeBand(41)).toBe("balanced");
      expect(getDegreeBand(50)).toBe("balanced");
      expect(getDegreeBand(60)).toBe("balanced");
    });

    it("maps 61-80 to heavy", () => {
      expect(getDegreeBand(61)).toBe("heavy");
      expect(getDegreeBand(75)).toBe("heavy");
      expect(getDegreeBand(80)).toBe("heavy");
    });

    it("maps 81-100 to reimagined", () => {
      expect(getDegreeBand(81)).toBe("reimagined");
      expect(getDegreeBand(95)).toBe("reimagined");
      expect(getDegreeBand(100)).toBe("reimagined");
    });

    it("clamps out-of-range values", () => {
      expect(getDegreeBand(-5)).toBe("minimal");
      expect(getDegreeBand(150)).toBe("reimagined");
    });

    it("rounds non-integer degrees to nearest", () => {
      expect(getDegreeBand(20.4)).toBe("minimal");
      expect(getDegreeBand(20.6)).toBe("light");
    });

    it("handles non-finite degrees safely (defaults to balanced)", () => {
      expect(getDegreeBand(Number.NaN)).toBe("balanced");
      expect(getDegreeBand(Number.POSITIVE_INFINITY)).toBe("balanced");
    });
  });

  describe("getReframePromptConfig", () => {
    it("minimal band system prompt contains the 8-word anti-plagiarism floor", () => {
      const cfg = getReframePromptConfig(15);
      expect(cfg.band).toBe("minimal");
      expect(cfg.systemPrompt).toMatch(/8 or more words/i);
      expect(cfg.systemPrompt).toMatch(/MINIMAL rewrite/i);
    });

    it("reimagined band system prompt mentions a new angle", () => {
      const cfg = getReframePromptConfig(90);
      expect(cfg.band).toBe("reimagined");
      expect(cfg.systemPrompt).toMatch(/new angle/i);
      expect(cfg.systemPrompt).toMatch(/FULLY REIMAGINED/i);
    });

    it("default length limit is 280 chars; allowLong raises it to 4000", () => {
      expect(getReframePromptConfig(50).systemPrompt).toContain("280 characters");
      expect(getReframePromptConfig(50, { allowLong: true }).systemPrompt).toContain(
        "4000 characters",
      );
    });

    it("applies shared rules (language preservation, no attribution) at every degree", () => {
      for (const d of [0, 25, 50, 75, 100]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toMatch(/Preserve the source language/i);
        expect(sys).toMatch(/Do NOT attribute/i);
        expect(sys).toMatch(/Output ONLY the tweet text/i);
      }
    });

    it("user prompt includes the trimmed source tweet in quotes", () => {
      const cfg = getReframePromptConfig(50);
      const prompt = cfg.userPrompt("  Hello world!  ");
      expect(prompt).toContain("Hello world!");
      expect(prompt).not.toContain("  Hello world!  ");
      expect(prompt).toMatch(/degree 50\/100/);
      expect(prompt).toMatch(/balanced/i);
    });

    it("balanced band forbids invented specifics", () => {
      const cfg = getReframePromptConfig(50);
      expect(cfg.systemPrompt).toMatch(/Do NOT invent specifics/i);
    });

    it("reimagined band still forbids inventing URLs/numbers/names", () => {
      const cfg = getReframePromptConfig(95);
      expect(cfg.systemPrompt).toMatch(/do NOT invent/i);
    });

    it("prompt variation appends a tone line when recognised", () => {
      const cfg = getReframePromptConfig(50, { promptVariation: "direct" });
      expect(cfg.systemPrompt).toMatch(/blunt and direct/i);
    });

    it("unknown prompt variation is silently ignored", () => {
      const cfg = getReframePromptConfig(50, { promptVariation: "nonexistent" });
      expect(cfg.systemPrompt).not.toMatch(/blunt and direct/i);
    });
  });
});
