import { describe, expect, it } from "vitest";
import { LINKEDIN_REPLY_LIMITS } from "../../../server/config/constants.js";
import { replyPostProcessor } from "../../../server/services/reply-postprocessor.js";
import { getDynamicReplyMaxWords } from "../../../server/services/oa-dynamic-reply-length.js";

const LI_CAP = LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS;

function processLinkedInReply(raw: string, replyMode?: string, maxWordsOverride?: number): string {
  return replyPostProcessor.processReply(raw, replyMode, maxWordsOverride ?? LI_CAP);
}

describe("LinkedIn reply postprocessor parity with X", () => {
  it("uses the shared replyPostProcessor with a 30-word default cap", () => {
    const input = "word ".repeat(40).trim();
    const result = processLinkedInReply(input);
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(LI_CAP);
  });

  it("removes start phrases the same way as X", () => {
    const input = "Spot on this is absolutely the right approach to consider here today";
    const result = processLinkedInReply(input);
    expect(result.toLowerCase()).not.toContain("spot on");
    expect(result.length).toBeGreaterThan(0);
  });

  it("removes banned hashtags", () => {
    const input = "Great point about leadership #leadership and team building today";
    const result = processLinkedInReply(input);
    expect(result).not.toMatch(/#\w+/);
  });

  it("strips ending punctuation", () => {
    const input = "This is a solid take on the topic.";
    const result = processLinkedInReply(input);
    expect(result).not.toMatch(/[.,!:;]+$/);
  });

  it("removes meta-commentary prefix and self-referential start phrases", () => {
    const input = "Here's a possible reply: This resonates with my experience building teams.";
    const result = processLinkedInReply(input);
    expect(result.toLowerCase()).not.toContain("here's a possible reply");
    expect(result.toLowerCase()).not.toContain("this resonates");
    expect(result.toLowerCase()).toContain("building teams");
  });

  it("respects OA dynamic maxWordsOverride from comment length", () => {
    const shortComment = "Nice work";
    const dynamicMax = getDynamicReplyMaxWords(shortComment);
    expect(dynamicMax).toBeGreaterThan(0);
    expect(dynamicMax).toBeLessThanOrEqual(LI_CAP);

    const input = "one two three four five six seven eight nine ten eleven twelve";
    const result = processLinkedInReply(input, undefined, dynamicMax);
    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(dynamicMax);
  });

  it("supports single-sentence reply mode like X", () => {
    const input = "This is the first sentence. This is a second sentence here.";
    const result = processLinkedInReply(input, "single-sentence", LI_CAP);
    expect(result.toLowerCase()).not.toContain("second sentence");
  });
});
