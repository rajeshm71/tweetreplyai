import { describe, expect, it } from "vitest";
import { replyPostProcessor } from "../../../server/services/reply-postprocessor";

/**
 * Behavioral tests for ReplyPostProcessor.processReframe.
 *
 * The reframe flow (Reuse tweet) MUST preserve line breaks that the LLM
 * produced — unlike the reply flow, tweet structure is meaningful here.
 * These tests lock that behavior in.
 */

describe("ReplyPostProcessor.processReframe - Unit Tests", () => {
  describe("empty and null inputs", () => {
    it("returns empty string for empty input", () => {
      expect(replyPostProcessor.processReframe("")).toBe("");
    });

    it("returns empty string for whitespace-only input", () => {
      expect(replyPostProcessor.processReframe("   \n  \t  ")).toBe("");
    });

    it("returns empty string for null-like falsy input (cast)", () => {
      expect(replyPostProcessor.processReframe(null as any)).toBe("");
    });

    it("returns empty string for non-string input (cast)", () => {
      expect(replyPostProcessor.processReframe(123 as any)).toBe("");
    });
  });

  describe("newline preservation", () => {
    it("preserves a single \\n between two lines", () => {
      const input = "You don't hate working.\nYou hate working hard and still being broke.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe(input);
      expect(out.includes("\n")).toBe(true);
    });

    it("preserves a double-newline paragraph break", () => {
      const input = "First paragraph here.\n\nSecond paragraph here too.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe(input);
      expect(out.match(/\n\n/)).not.toBeNull();
    });

    it("collapses 3+ consecutive newlines down to a single blank line (\\n\\n)", () => {
      const input = "Line A\n\n\n\nLine B";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Line A\n\nLine B");
    });

    it("trims trailing/leading horizontal whitespace around a newline", () => {
      const input = "Line A   \n   Line B";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Line A\nLine B");
    });

    it("preserves \\n when the input mixes \\r\\n style breaks (CRLF -> LF-like)", () => {
      // Note: We don't explicitly normalize \r\n, but the regex
      // [ \t]*\n[ \t]*  keeps the \n even when \r is present.
      const input = "Line A\r\nLine B";
      const out = replyPostProcessor.processReframe(input);
      // At minimum, we must not collapse the newline into a space.
      expect(out.includes("\n")).toBe(true);
      expect(out.includes("Line A")).toBe(true);
      expect(out.includes("Line B")).toBe(true);
    });
  });

  describe("horizontal whitespace cleanup", () => {
    it("collapses runs of spaces within a line to a single space", () => {
      const input = "Too    many     spaces    here.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Too many spaces here.");
    });

    it("collapses tabs within a line to a single space", () => {
      const input = "Tab\tseparated\t\twords";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Tab separated words");
    });

    it("collapses non-breaking spaces (U+00A0) to a regular space", () => {
      const input = "Word\u00A0\u00A0with\u00A0nbsp";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Word with nbsp");
    });

    it("trims leading and trailing whitespace (including around newlines)", () => {
      const input = "\n\n  First line\n  Second line  \n\n";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("First line\nSecond line");
    });
  });

  describe("wrapper quote removal still works", () => {
    it('strips surrounding double-quotes, preserving interior \\n', () => {
      const input = '"First line.\nSecond line."';
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("First line.\nSecond line.");
    });

    it("strips surrounding single-quotes, preserving interior \\n", () => {
      const input = "'First line.\nSecond line.'";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("First line.\nSecond line.");
    });
  });

  describe("meta-commentary removal still works", () => {
    it("strips a leading 'Here's a reply:' prefix and preserves newlines after it", () => {
      const input = "Here's a reply: First line\nSecond line goes here.";
      const out = replyPostProcessor.processReframe(input);
      expect(out.startsWith("Here's a reply")).toBe(false);
      expect(out.includes("\n")).toBe(true);
      expect(out.includes("First line")).toBe(true);
      expect(out.includes("Second line")).toBe(true);
    });
  });

  describe("banned patterns removal still works", () => {
    it("removes inline hashtags while preserving line-break structure", () => {
      const input = "Great take. #motivation\nKeep pushing. #grind";
      const out = replyPostProcessor.processReframe(input);
      expect(out.includes("#motivation")).toBe(false);
      expect(out.includes("#grind")).toBe(false);
      expect(out.includes("\n")).toBe(true);
    });
  });

  describe("dash replacement (same as replies)", () => {
    it("replaces hyphen between words with a space", () => {
      const input = "This is a well-known fact.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("This is a well known fact.");
    });

    it("replaces em dash between words with a space", () => {
      const input = "Great take—worth sharing.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Great take worth sharing.");
    });

    it("preserves digit-digit dashes (e.g. 9-5)", () => {
      const input = "Work a 9-5 and still feel stuck.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Work a 9-5 and still feel stuck.");
    });

    it("replaces dashes on each line while preserving newlines", () => {
      const input = "Line one—bold claim.\nLine two - spaced dash.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Line one bold claim.\nLine two spaced dash.");
    });
  });

  describe("formatReframeLineBreaks fallback", () => {
    it("splits a dense paragraph into multiple lines", () => {
      const input =
        "First sentence here. Second sentence follows. Third sentence closes it.";
      const out = replyPostProcessor.processReframe(input);
      expect(out.includes("\n")).toBe(true);
      expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
    });

    it("leaves short one-liners on a single line", () => {
      const input = "Ship it today.";
      const out = replyPostProcessor.processReframe(input);
      expect(out).toBe("Ship it today.");
      expect(out.includes("\n")).toBe(false);
    });
  });

  describe("does NOT flatten multi-line output into a single line", () => {
    it("a 3-line tweet survives end-to-end as a 3-line string", () => {
      const input = "Line one is here.\nLine two continues.\nLine three closes it.";
      const out = replyPostProcessor.processReframe(input);
      expect(out.split("\n").length).toBe(3);
    });

    it("returns original (trimmed) when processing would otherwise yield empty", () => {
      // Only a wrapper-quote around whitespace-only payload -> effectively empty.
      const input = '"   "';
      const out = replyPostProcessor.processReframe(input);
      // Should fall back to the trimmed original rather than return "".
      expect(out.length).toBeGreaterThan(0);
    });
  });
});
