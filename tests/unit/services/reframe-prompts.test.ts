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
      expect(cfg.systemPrompt).toMatch(/simpler everyday words/i);
      expect(cfg.systemPrompt).not.toMatch(
        /Preserve the original structure, vocabulary, sentiment, and formatting/,
      );
    });

    it("reimagined band scopes new angle to options and body, not replacing lead questions", () => {
      const cfg = getReframePromptConfig(90);
      expect(cfg.band).toBe("reimagined");
      expect(cfg.systemPrompt).toMatch(/new angle/i);
      expect(cfg.systemPrompt).toMatch(/not by replacing a lead question/i);
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

    it("includes the global structural pattern rule at every degree", () => {
      for (const d of [0, 25, 50, 75, 100]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toMatch(/Structural pattern/i);
        expect(sys).toMatch(/Do not collapse list-like sources/i);
        expect(sys).toMatch(/List markers may change/i);
        expect(sys).toMatch(/do not concatenate multiple source lines/i);
      }
    });

    it("includes the lead-question preservation rule at every degree", () => {
      for (const d of [0, 25, 50, 75, 100]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toMatch(/Lead question \(when applicable\)/i);
        expect(sys).toMatch(/statement lead/i);
        expect(sys).toMatch(/do not invent a question for purely declarative opens/i);
      }
    });

    it("includes plain everyday English guidance at every degree", () => {
      for (const d of [0, 25, 50, 75, 100]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toMatch(/Plain language \(when the source is English\)/i);
        expect(sys).toMatch(/simple, everyday words/i);
      }
    });

    it("opening persona asks for plain everyday language", () => {
      expect(getReframePromptConfig(50).systemPrompt).toMatch(/plain everyday language/i);
      expect(getReframePromptConfig(50).systemPrompt).not.toMatch(/seasoned X/);
    });

    it("analytical tone stresses plain wording over formal diction", () => {
      const cfg = getReframePromptConfig(50, { promptVariation: "analytical" });
      expect(cfg.systemPrompt).toMatch(/simple everyday English/i);
      expect(cfg.systemPrompt).toMatch(/not academic/i);
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

  describe("per-band formatting instructions", () => {
    it("minimal (degree=10) and light (degree=35) instruct the model to preserve source line breaks", () => {
      for (const d of [10, 35]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toContain("PRESERVE the source's line-break structure");
        expect(sys).toMatch(/Markers may change/i);
      }
    });

    it("light (degree=35) prefers simpler everyday language when rewording", () => {
      const sys = getReframePromptConfig(35).systemPrompt;
      expect(sys).toMatch(/simpler everyday language/i);
      expect(sys).toMatch(/jargon-heavy phrasing/i);
    });

    it("balanced (degree=50) instructs the model to mirror list/multiline layout", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).toMatch(/mirror the source layout/i);
      expect(sys).toMatch(/list-like/i);
      expect(sys).not.toContain("1-3 short paragraphs is typical");
    });

    it("balanced (degree=50) allows dropping redundant items and one related line", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).toMatch(/drop redundant items/i);
      expect(sys).toMatch(/at most one short related line/i);
    });

    it("balanced (degree=50) preserves opening question intent instead of swapping the hook", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).not.toContain("swapping the hook");
      expect(sys).toMatch(/same question intent/i);
    });

    it("heavy (degree=75) reframes hook without requiring a different prompt (no 'new hook')", () => {
      const sys = getReframePromptConfig(75).systemPrompt;
      expect(sys).not.toMatch(/\ba new hook\b/i);
      expect(sys).toMatch(/must stay a question with the same intent/i);
    });

    it("heavy (degree=75) forbids collapsing list-like sources and encourages add/remove lines", () => {
      const sys = getReframePromptConfig(75).systemPrompt;
      expect(sys).toMatch(/do not collapse list-like sources into one narrative paragraph/i);
      expect(sys).toMatch(/Add or remove lines/i);
      expect(sys).toMatch(/original, not copied/i);
    });

    it("reimagined (degree=95) actively varies lines and preserves break rhythm", () => {
      const sys = getReframePromptConfig(95).systemPrompt;
      expect(sys).toMatch(/Actively add, drop, or replace lines/i);
      expect(sys).toMatch(/blank-line rhythm/i);
    });

    it("heavy (degree=75) still favors short punchy lines between items", () => {
      const sys = getReframePromptConfig(75).systemPrompt;
      expect(sys).toContain("short, punchy lines");
    });

    it("every band advertises that plain line breaks are allowed and disallows stray markdown syntax", () => {
      for (const d of [0, 25, 50, 75, 100]) {
        const sys = getReframePromptConfig(d).systemPrompt;
        expect(sys).toContain("Plain line breaks are allowed");
        expect(sys).not.toMatch(/code fences, or markdown\.$/m);
      }
    });

    it("user prompt instructs layout, markers, lead question, and add/drop related lines", () => {
      const prompt = getReframePromptConfig(50).userPrompt("Example source tweet");
      expect(prompt).toContain("Match the source layout");
      expect(prompt).toMatch(/preserve line breaks and blank-line gaps/i);
      expect(prompt).toMatch(/list markers may change/i);
      expect(prompt).toMatch(/If the source opens with a question/i);
      expect(prompt).toMatch(/keep that question/i);
      expect(prompt).toMatch(/Add or drop related lines as needed so it does not read as copied/i);
      expect(prompt).toMatch(/simple everyday words/i);
      expect(prompt).toMatch(/list-like sources stay list-like/i);
    });
  });
});
