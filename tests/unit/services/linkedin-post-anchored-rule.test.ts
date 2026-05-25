import { describe, expect, it } from "vitest";
import {
  LINKEDIN_POST_ANCHORED_RULE,
  LINKEDIN_PROMPT_VARIATIONS,
  LINKEDIN_USER_PROMPT_SUFFIX,
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

  it("uses positive-framed post-anchored guidance without phrase ban lists", () => {
    expect(LINKEDIN_POST_ANCHORED_RULE).toContain("Write one short statement in your own words");
    expect(LINKEDIN_POST_ANCHORED_RULE).toContain("Speak as a commenter");
    expect(LINKEDIN_POST_ANCHORED_RULE).not.toContain("Do NOT open with");
    expect(LINKEDIN_POST_ANCHORED_RULE).not.toContain("I've seen");
  });

  it("default variation uses commenter voice and shared user prompt suffix", () => {
    const base = LINKEDIN_PROMPT_VARIATIONS.default.systemPrompt;
    expect(base).toContain("Write like a commenter, not a summarizer");
    expect(getLinkedInPromptConfig("default").userPrompt("Sample post.")).toContain(
      LINKEDIN_USER_PROMPT_SUFFIX,
    );
  });
});
