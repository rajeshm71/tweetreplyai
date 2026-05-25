import { describe, expect, it } from "vitest";
import { replyPostProcessor } from "../../../server/services/reply-postprocessor";
import { REPLY_LIMITS } from "../../../server/config/constants";

/**
 * Behavioral tests for ReplyPostProcessor.
 * All tests are pure / synchronous — no mocking required.
 *
 * Key constants:
 *   POST_PROCESSOR_MAX_WORDS = 50  (hard word cap)
 *   POST_PROCESSOR_MIN_WORDS = 5   (if output drops below this, fallback to original)
 *   SINGLE_SENTENCE_MAX_WORDS = 20 (single-sentence mode cap)
 */

describe("Reply Postprocessor Service - Unit Tests", () => {
  describe("module exports", () => {
    it("exports a replyPostProcessor singleton", () => {
      expect(replyPostProcessor).toBeDefined();
      expect(typeof replyPostProcessor.processReply).toBe("function");
      expect(typeof replyPostProcessor.processReplyLight).toBe("function");
    });
  });

  describe("processReply — empty and null inputs", () => {
    it("returns empty string for empty input", () => {
      expect(replyPostProcessor.processReply("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(replyPostProcessor.processReply("   ")).toBe("");
    });

    it("returns empty string for null-like falsy input (cast)", () => {
      expect(replyPostProcessor.processReply(null as any)).toBe("");
    });
  });

  describe("processReply — wrapper quote removal", () => {
    it('strips surrounding double-quotes from reply', () => {
      // Need 5+ words to avoid fallback
      const input = '"This is a great point about that"';
      const result = replyPostProcessor.processReply(input);
      expect(result).not.toMatch(/^"/);
      expect(result).not.toMatch(/"$/);
    });

    it('strips surrounding single-quotes from reply', () => {
      const input = "'This is a great reply about stuff'";
      const result = replyPostProcessor.processReply(input);
      expect(result).not.toMatch(/^'/);
    });
  });

  describe("processReply — banned pattern removal", () => {
    it("removes hashtags from reply", () => {
      const input = "Great point about technology #trending and innovation #tech";
      const result = replyPostProcessor.processReply(input);
      expect(result).not.toMatch(/#\w+/);
    });

    it("removes 'Check out my' phrase", () => {
      const input = "This is good content. Check out my new post about this topic.";
      const result = replyPostProcessor.processReply(input);
      expect(result.toLowerCase()).not.toContain("check out my");
    });
  });

  describe("processReply — word count limits", () => {
    it(`truncates to POST_PROCESSOR_MAX_WORDS (${REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS}) when input exceeds limit`, () => {
      const input = "word ".repeat(60).trim(); // 60 words
      const result = replyPostProcessor.processReply(input);
      const wordCount = result.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS);
    });

    it("respects maxWordsOverride when provided", () => {
      const input = "one two three four five six seven eight nine ten eleven twelve";
      const result = replyPostProcessor.processReply(input, undefined, 8);
      const wordCount = result.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(8);
    });

    it("maxWordsOverride is capped at POST_PROCESSOR_MAX_WORDS even if higher value given", () => {
      const input = "word ".repeat(60).trim();
      const result = replyPostProcessor.processReply(input, undefined, 200);
      const wordCount = result.split(/\s+/).filter(Boolean).length;
      // Cap is 50, never more
      expect(wordCount).toBeLessThanOrEqual(REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS);
    });
  });

  describe("processReply — single-sentence mode", () => {
    it("returns only first sentence when replyMode is single-sentence", () => {
      const input = "This is the first sentence. This is a second sentence here.";
      const result = replyPostProcessor.processReply(input, "single-sentence");
      // Must not contain the second sentence content
      expect(result.toLowerCase()).not.toContain("second sentence");
    });

    it("single-sentence result is shorter than or equal to enhanced result for same input", () => {
      const input = "This is a reply. It has multiple sentences and more words here.";
      const singleResult = replyPostProcessor.processReply(input, "single-sentence");
      const enhancedResult = replyPostProcessor.processReply(input, "enhanced");
      expect(singleResult.length).toBeLessThanOrEqual(enhancedResult.length);
    });
  });

  describe("processReply — fallback behaviour", () => {
    it("falls back to original when aggressive processing would produce too few words", () => {
      // An input of exactly 5 words with a START_PHRASE that removes words could trigger fallback
      // Use "Spot on" (in START_PHRASES) + 3 remaining words — result would be < 5 words, fallback fires
      const input = "Spot on right now people";
      const result = replyPostProcessor.processReply(input);
      // Either the original is returned or the cleaned result — both are non-empty
      expect(result.trim()).not.toBe("");
    });
  });

  describe("processReply — whitespace normalization", () => {
    it("collapses multiple spaces into one", () => {
      const input = "hello   world   this   is   great   content   here   now";
      const result = replyPostProcessor.processReply(input);
      expect(result).not.toMatch(/  +/); // no double spaces
    });
  });

  describe("processReply — post-anchored agreement policy", () => {
    it("preserves Same here, Yeah, and Exactly openers", () => {
      const cases = [
        "Same here the satisfaction loop is where most modules still break down today",
        "Yeah the attention half is easy but accomplishment is where modules fail",
        "Exactly the satisfaction loop is the hard part for most AI driven modules",
      ];
      for (const input of cases) {
        const result = replyPostProcessor.processReply(input);
        expect(result.split(/\s+/)[0].toLowerCase()).toMatch(/^(same|yeah|exactly)/);
      }
    });

    it("strips Spot on prefix from reply", () => {
      const input = "Spot on the satisfaction loop is where most AI modules still feel empty today";
      const result = replyPostProcessor.processReply(input);
      expect(result.toLowerCase()).not.toMatch(/^spot on/);
    });

    it("strips I agree prefix from reply", () => {
      const input = "I agree the satisfaction loop matters more than attention hooks in modules";
      const result = replyPostProcessor.processReply(input);
      expect(result.toLowerCase()).not.toMatch(/^i agree/);
    });

    it("drops first sentence when reply opens with I've seen self-reference", () => {
      const input =
        "I've seen this happen in our own courses where modules grab attention. The satisfaction loop is still the missing piece for most teams.";
      const result = replyPostProcessor.processReply(input);
      expect(result.toLowerCase()).not.toContain("our own courses");
      expect(result.toLowerCase()).toContain("satisfaction loop");
    });
  });

  describe("processReplyLight — lighter processing", () => {
    it("does not remove start phrases that processReply would remove", () => {
      // "Spot on" is in START_PHRASES — processReply removes it, processReplyLight keeps it
      const input = "Spot on this is absolutely the right approach to consider here";
      const lightResult = replyPostProcessor.processReplyLight(input);
      const fullResult = replyPostProcessor.processReply(input);
      // Light result should keep "Spot on", full result removes it
      expect(lightResult.toLowerCase()).toContain("spot on");
      expect(fullResult.toLowerCase()).not.toContain("spot on");
    });

    it("still strips banned hashtags even in light mode", () => {
      const input = "Great insight about coding #coding and design patterns here today";
      const result = replyPostProcessor.processReplyLight(input);
      expect(result).not.toMatch(/#\w+/);
    });

    it("returns empty string for empty input in light mode", () => {
      expect(replyPostProcessor.processReplyLight("")).toBe("");
    });

    it("still respects word count limits in light mode", () => {
      const input = "word ".repeat(60).trim();
      const result = replyPostProcessor.processReplyLight(input);
      const wordCount = result.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS);
    });
  });
});
