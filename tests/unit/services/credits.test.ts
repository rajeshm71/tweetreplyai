import { describe, expect, it } from "vitest";
import { getCreditCost, CREDIT_COSTS } from "../../../server/services/credits";

describe("Credits Service - Unit Tests", () => {
  describe("CREDIT_COSTS constant", () => {
    it("has all three expected plan keys", () => {
      expect(CREDIT_COSTS).toHaveProperty("single-sentence");
      expect(CREDIT_COSTS).toHaveProperty("enhanced");
      expect(CREDIT_COSTS).toHaveProperty("improve");
    });

    it("single-sentence costs 1 credit", () => {
      expect(CREDIT_COSTS["single-sentence"]).toBe(1);
    });

    it("enhanced costs 2 credits", () => {
      expect(CREDIT_COSTS["enhanced"]).toBe(2);
    });

    it("improve costs 2 credits", () => {
      expect(CREDIT_COSTS["improve"]).toBe(2);
    });
  });

  describe("getCreditCost", () => {
    it("returns 2 when replyMode is undefined (defaults to enhanced)", () => {
      expect(getCreditCost(undefined)).toBe(2);
    });

    it("returns 2 when replyMode is empty string (unknown falls back to enhanced)", () => {
      expect(getCreditCost("")).toBe(2);
    });

    it("returns 1 for single-sentence mode", () => {
      expect(getCreditCost("single-sentence")).toBe(1);
    });

    it("returns 2 for enhanced mode", () => {
      expect(getCreditCost("enhanced")).toBe(2);
    });

    it("returns 2 for improve mode", () => {
      expect(getCreditCost("improve")).toBe(2);
    });

    it("returns 2 for unknown mode strings (fallback via ??)", () => {
      expect(getCreditCost("legacy")).toBe(2);
      expect(getCreditCost("pro")).toBe(2);
      expect(getCreditCost("super-mode")).toBe(2);
    });
  });
});
