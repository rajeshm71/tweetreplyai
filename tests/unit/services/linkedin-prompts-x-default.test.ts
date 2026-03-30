import { describe, expect, it } from "vitest";
import { LINKEDIN_REPLY_LIMITS } from "../../../server/config/constants.js";
import {
  LINKEDIN_META_COMMENTARY_RULE,
  LINKEDIN_SIMPLE_LANGUAGE_RULE,
  getLinkedInPromptConfig,
} from "../../../server/services/prompts-linkedin.js";

describe("LinkedIn x_default", () => {
  it("uses X-style base copy and LinkedIn reply limits in the base system prompt", () => {
    const base = getLinkedInPromptConfig("x_default").systemPrompt;
    expect(base).toContain("scrolling X (Twitter)");
    expect(base).toContain(
      `Keep under ${LINKEDIN_REPLY_LIMITS.MAX_WORDS} words`,
    );
  });

  it("wraps with shared LinkedIn meta + simple-language rules like other variations", () => {
    const full = getLinkedInPromptConfig("x_default").systemPrompt;
    expect(full).toContain(LINKEDIN_META_COMMENTARY_RULE.trim().slice(0, 40));
    expect(full).toContain(LINKEDIN_SIMPLE_LANGUAGE_RULE.trim().slice(0, 30));
  });

  it("user prompt matches X default wording (Tweet label)", () => {
    const sample = "Hello world.";
    expect(getLinkedInPromptConfig("x_default").userPrompt(sample)).toBe(
      `Tweet: "${sample}"

Reply naturally and casually.`,
    );
  });
});
