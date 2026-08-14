import { describe, expect, it } from "vitest";
import { getDegreeBand, getReframePromptConfig } from "../../../server/services/reframe-prompts";

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

  describe("restored prompt structure", () => {
    it("uses original band phrasing at every degree", () => {
      expect(getReframePromptConfig(15).systemPrompt).toMatch(/This is a MINIMAL rewrite/i);
      expect(getReframePromptConfig(35).systemPrompt).toMatch(/This is a LIGHT rewrite/i);
      expect(getReframePromptConfig(50).systemPrompt).toMatch(/This is a BALANCED rewrite/i);
      expect(getReframePromptConfig(75).systemPrompt).toMatch(/This is a HEAVY rewrite/i);
      expect(getReframePromptConfig(95).systemPrompt).toMatch(/This is a FULLY REIMAGINED rewrite/i);
    });

    it("includes anti-duplicate rules in shared hard rules", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).toMatch(/Anti-duplicate \(all bands\)/i);
      expect(sys).toMatch(/Never copy the source opening line verbatim/i);
      expect(sys).toMatch(/8\+ words identical to the source/i);
    });

    it("includes tweet output formatting rules", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).toMatch(/Tweet output formatting/i);
      expect(sys).toMatch(/line break after each sentence or list item/i);
      expect(sys).toMatch(/Do not stack multiple questions/i);
      expect(sys).toMatch(/continuous paragraph, split your rewrite/i);
    });

    it("user prompt includes structure hint for paragraph sources", () => {
      const source =
        "This is one long paragraph. It has multiple sentences. Readers need line breaks.";
      const prompt = getReframePromptConfig(50).userPrompt(source);
      expect(prompt).toMatch(/continuous paragraph/i);
      expect(prompt).toMatch(/do not output one dense block/i);
    });

    it("does not include rewrite-era insight checklist or DEFAULT_VOICE blocks", () => {
      const sys = getReframePromptConfig(50).systemPrompt;
      expect(sys).not.toMatch(/Insight first:/i);
      expect(sys).not.toMatch(/Default voice \(always on\)/i);
    });

    it("appends retry boost when retryBoost is true", () => {
      const cfg = getReframePromptConfig(50, { retryBoost: true });
      expect(cfg.systemPrompt).toMatch(/RETRY — prior draft was too similar/i);
    });

    it("user prompt is a single task paragraph without A/B/C checklist", () => {
      const prompt = getReframePromptConfig(50).userPrompt("Example source tweet");
      expect(prompt).toMatch(/Rewrite the tweet above as your own standalone tweet at degree 50\/100 \(balanced\)/);
      expect(prompt).toMatch(/scannable X tweet with proper line breaks/i);
      expect(prompt).not.toMatch(/Core insight:/i);
      expect(prompt).not.toMatch(/Before you write \(mental only\)/i);
      expect(prompt).not.toMatch(/Checklist:/i);
    });
  });

  describe("high-degree structural rewrite rules", () => {
    it("includes structural rewrite block at heavy and reimagined only", () => {
      expect(getReframePromptConfig(75).systemPrompt).toMatch(/Structural rewrite \(heavy \/ reimagined only\)/i);
      expect(getReframePromptConfig(95).systemPrompt).toMatch(/line-by-line/i);
      expect(getReframePromptConfig(50).systemPrompt).not.toMatch(/Structural rewrite \(heavy \/ reimagined only\)/i);
    });

    it("includes illustrative number flexibility at heavy+", () => {
      expect(getReframePromptConfig(75).systemPrompt).toMatch(/Illustrative \/ example details may change/i);
      expect(getReframePromptConfig(95).systemPrompt).toMatch(/Actively refresh illustrative examples/i);
    });

    it("appends heavy+ user instruction only at degree 75+", () => {
      expect(getReframePromptConfig(75).userPrompt("Source")).toMatch(/do not mirror the source's sentence order/i);
      expect(getReframePromptConfig(50).userPrompt("Source")).not.toMatch(/do not mirror the source's sentence order/i);
    });

    it("retry boost includes structural rewrite guidance", () => {
      const cfg = getReframePromptConfig(75, { retryBoost: true });
      expect(cfg.systemPrompt).toMatch(/mirrored the source line-by-line/i);
      expect(cfg.systemPrompt).toMatch(/Illustrative numbers and examples may change/i);
      expect(cfg.systemPrompt).toMatch(/Prior draft was one dense paragraph/i);
    });
  });

  describe("getReframePromptConfig shared rules", () => {
    it("minimal band contains anti-plagiarism floor", () => {
      const cfg = getReframePromptConfig(15);
      expect(cfg.band).toBe("minimal");
      expect(cfg.systemPrompt).toMatch(/8 or more words identical to the source/i);
      expect(cfg.systemPrompt).toMatch(/This is a MINIMAL rewrite/i);
    });

    it("allowLong removes the 4000 product cap", () => {
      expect(getReframePromptConfig(50).systemPrompt).toContain("280 characters");
      const longSys = getReframePromptConfig(50, { allowLong: true }).systemPrompt;
      expect(longSys).toMatch(/no product character cap/i);
      expect(longSys).not.toMatch(/must fit in 4000 characters/i);
    });

    it("includes lead-question preservation at every degree", () => {
      for (const d of [0, 50, 100]) {
        expect(getReframePromptConfig(d).systemPrompt).toMatch(/Lead question \(when applicable\)/i);
        expect(getReframePromptConfig(d).systemPrompt).toMatch(/Declarative opening \(when applicable\)/i);
        expect(getReframePromptConfig(d).systemPrompt).toMatch(/Do not invent a question hook/i);
      }
    });

    it("user prompt forbids invented question hooks on statement opens", () => {
      const prompt = getReframePromptConfig(75).userPrompt("Karpathy released a free course on YouTube.");
      expect(prompt).toMatch(/If the source opens with a statement or headline, keep a statement opening/i);
      expect(prompt).toMatch(/do not invent a question hook/i);
    });

    it("includes required author instructions in user prompt when reuseGuidance is set", () => {
      const prompt = getReframePromptConfig(50, { reuseGuidance: "Make it shorter and more casual" }).userPrompt(
        "Example source tweet with enough length to reframe properly here.",
      );
      expect(prompt).toMatch(/Author instructions \(required/i);
      expect(prompt).toMatch(/Make it shorter and more casual/);
      expect(prompt).toMatch(/Mental plan only \(do not output the plan/i);
      expect(prompt).toMatch(/output only the tweet/i);
      expect(prompt).not.toMatch(/Optional author guidance/i);
      expect(prompt).not.toMatch(/ignore guidance that asks to copy verbatim/i);
      const guidanceIdx = prompt.indexOf("Author instructions");
      const rewriteIdx = prompt.indexOf("Rewrite the tweet above");
      expect(guidanceIdx).toBeGreaterThan(-1);
      expect(rewriteIdx).toBeGreaterThan(guidanceIdx);
    });

    it("omits guidance block when reuseGuidance is empty", () => {
      const prompt = getReframePromptConfig(50, { reuseGuidance: "   " }).userPrompt("Example source tweet.");
      expect(prompt).not.toMatch(/Author instructions \(required/i);
      expect(prompt).not.toMatch(/Optional author guidance/i);
    });

    it("softens system formatting rules when reuseGuidance is set", () => {
      const sys = getReframePromptConfig(50, { reuseGuidance: "Keep it as one paragraph" }).systemPrompt;
      expect(sys).toMatch(/Author instructions outrank band formatting cosmetics/i);
      expect(sys).toMatch(/Prefer author instructions for length and format/i);
      expect(sys).not.toMatch(/do not return one dense block/i);
    });

    it("retry boost keeps author format when reuseGuidance is set", () => {
      const cfg = getReframePromptConfig(75, {
        retryBoost: true,
        reuseGuidance: "Keep it as one paragraph",
      });
      expect(cfg.systemPrompt).not.toMatch(/Prior draft was one dense paragraph/i);
      expect(cfg.systemPrompt).toMatch(/Keep applying author instructions/i);
    });
  });
});
