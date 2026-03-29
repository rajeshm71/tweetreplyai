import { describe, it, expect } from "vitest";
import { normalizeDodoSubscriptionStatus } from "../../../server/utils/dodoSubscriptionStatus";

describe("normalizeDodoSubscriptionStatus", () => {
  it("returns undefined for null/undefined", () => {
    expect(normalizeDodoSubscriptionStatus(undefined)).toBeUndefined();
    expect(normalizeDodoSubscriptionStatus(null)).toBeUndefined();
  });

  it("maps hyphenated and spaced variants", () => {
    expect(normalizeDodoSubscriptionStatus("past-due")).toBe("past_due");
    expect(normalizeDodoSubscriptionStatus("Past Due")).toBe("past_due");
  });

  it("maps cancelled to canceled", () => {
    expect(normalizeDodoSubscriptionStatus("cancelled")).toBe("canceled");
    expect(normalizeDodoSubscriptionStatus("Cancelled")).toBe("canceled");
  });

  it("accepts failed and other canonical values", () => {
    expect(normalizeDodoSubscriptionStatus("failed")).toBe("failed");
    expect(normalizeDodoSubscriptionStatus("active")).toBe("active");
    expect(normalizeDodoSubscriptionStatus("unpaid")).toBe("unpaid");
  });

  it("returns undefined for unknown strings", () => {
    expect(normalizeDodoSubscriptionStatus("weird")).toBeUndefined();
  });
});
