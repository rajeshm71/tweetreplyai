import { describe, it, expect } from "vitest";
import {
  getDynamicReplyMaxWords,
  getDynamicReplyWordRange,
} from "../../../server/services/oa-dynamic-reply-length";

describe("OA Dynamic Reply Length - Unit Tests", () => {
  describe("getDynamicReplyMaxWords", () => {
    it("returns 0 for an empty string", () => {
      expect(getDynamicReplyMaxWords("")).toBe(0);
    });

    it("returns 0 for a whitespace-only string", () => {
      expect(getDynamicReplyMaxWords("   ")).toBe(0);
    });

    it("returns tier-1 max (5) for a 1-word comment", () => {
      expect(getDynamicReplyMaxWords("Hi")).toBe(5);
    });

    it("returns tier-1 max (5) for a 3-word comment (boundary)", () => {
      expect(getDynamicReplyMaxWords("Love this post")).toBe(5);
    });

    it("returns tier-2 max (15) for a 4-word comment (first word above tier-1)", () => {
      expect(getDynamicReplyMaxWords("Love this great post")).toBe(15);
    });

    it("returns tier-3 max (25) for a 9-word comment (first above tier-2 boundary of 8)", () => {
      expect(getDynamicReplyMaxWords("This is a very interesting and insightful idea now")).toBe(25);
    });

    it("returns tier-2 max (15) for an 8-word comment (tier-2 boundary)", () => {
      expect(getDynamicReplyMaxWords("This is a very interesting and great idea")).toBe(15);
    });

    it("returns the highest tier max (30) for a long comment (>15 words)", () => {
      const longComment =
        "This is a very detailed and thoughtful comment spanning well over fifteen words total here yes it does";
      expect(getDynamicReplyMaxWords(longComment)).toBe(30);
    });
  });

  describe("getDynamicReplyWordRange", () => {
    it("returns null for an empty string", () => {
      expect(getDynamicReplyWordRange("")).toBeNull();
    });

    it("returns null for whitespace only", () => {
      expect(getDynamicReplyWordRange("   ")).toBeNull();
    });

    it("returns { min, max } object with numbers for a non-empty comment", () => {
      const range = getDynamicReplyWordRange("Hello there");
      expect(range).not.toBeNull();
      expect(typeof range!.min).toBe("number");
      expect(typeof range!.max).toBe("number");
    });

    it("returns tier-1 range { min: 1, max: 5 } for a 2-word comment", () => {
      const range = getDynamicReplyWordRange("Great content");
      expect(range).toEqual({ min: 1, max: 5 });
    });

    it("returns tier-2 range { min: 6, max: 15 } for a 5-word comment", () => {
      const range = getDynamicReplyWordRange("I think this is good");
      expect(range).toEqual({ min: 6, max: 15 });
    });

    it("min is always less than or equal to max", () => {
      const texts = [
        "Hi",
        "Good insight today here",
        "This is a fairly long comment with more words",
        "An extremely long comment that spans many many words and goes well beyond fifteen",
      ];
      for (const text of texts) {
        const range = getDynamicReplyWordRange(text);
        if (range) {
          expect(range.min).toBeLessThanOrEqual(range.max);
        }
      }
    });
  });
});
