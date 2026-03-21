import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, validateEmail, validatePasswordStrength } from "../../../server/utils/password";

describe("Password Utils - Unit Tests", () => {
  it("hashes and verifies password", async () => {
    const hash = await hashPassword("Secret123!");
    const ok = await verifyPassword("Secret123!", hash);
    expect(ok).toBe(true);
  });

  it("rejects wrong password against hash", async () => {
    const hash = await hashPassword("Secret123!");
    const ok = await verifyPassword("WrongPass!", hash);
    expect(ok).toBe(false);
  });

  it("validates email format", () => {
    expect(validateEmail("a@b.com")).toBe(true);
    expect(validateEmail("bad-email")).toBe(false);
  });

  describe("validatePasswordStrength", () => {
    it("accepts a strong password", () => {
      const result = validatePasswordStrength("StrongPass1!");
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects password without uppercase letter", () => {
      const result = validatePasswordStrength("weakpass1!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.toLowerCase().includes("upper"))).toBe(true);
    });

    it("rejects password without a number", () => {
      const result = validatePasswordStrength("NoNumbers!");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e: string) => e.toLowerCase().includes("number") || e.toLowerCase().includes("digit"))).toBe(true);
    });

    it("rejects password shorter than 8 characters", () => {
      const result = validatePasswordStrength("Ab1!");
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("accepts password with only alphanumeric chars (function does not require special characters)", () => {
      // NOTE: validatePasswordStrength checks: length≥8, uppercase, lowercase, digit only.
      // It does NOT check for special characters — this is by design.
      const result = validatePasswordStrength("NoSpecial1A");
      expect(result.isValid).toBe(true);
    });
  });
});

