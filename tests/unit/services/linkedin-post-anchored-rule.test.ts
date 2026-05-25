import { describe, expect, it } from "vitest";
import {
  LINKEDIN_POST_ANCHORED_RULE,
  LINKEDIN_PROMPT_VARIATIONS,
  getLinkedInPromptConfig,
} from "../../../server/services/prompts-linkedin.js";
import { getLinkedInOriginalAuthorPromptConfig } from "../../../server/services/prompts-linkedin-original-author.js";

describe("LinkedIn post-anchored rule", () => {
  it("appends LINKEDIN_POST_ANCHORED_RULE to every viewer variation", () => {
    for (const key of Object.keys(LINKEDIN_PROMPT_VARIATIONS)) {
      const config = getLinkedInPromptConfig(key);
      expect(config.systemPrompt).toContain(LINKEDIN_POST_ANCHORED_RULE.trim().slice(0, 40));
    }
  });

  it("appends LINKEDIN_POST_ANCHORED_RULE to original-author config", () => {
    const config = getLinkedInOriginalAuthorPromptConfig("default");
    expect(config.systemPrompt).toContain(LINKEDIN_POST_ANCHORED_RULE.trim().slice(0, 40));
  });

  it("default variation no longer asks for relevant experience", () => {
    const base = LINKEDIN_PROMPT_VARIATIONS.default.systemPrompt;
    expect(base).not.toContain("relevant experience");
    expect(base).toContain("no imported stories");
  });

  it("default user prompt asks for post-specific reply without workplace mention", () => {
    const userPrompt = getLinkedInPromptConfig("default").userPrompt("Sample post.");
    expect(userPrompt).toContain("one specific thing");
    expect(userPrompt).toContain("Do not mention your own experience");
  });
});
