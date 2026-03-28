import { describe, expect, it } from "vitest";
import { APP_DISPLAY_NAME, PLAN_LIMITS, PLAN_PERIODS_DAYS } from "../../../shared/constants";

describe("Shared Constants - Unit Tests", () => {
  it("APP_DISPLAY_NAME is the public product label", () => {
    expect(APP_DISPLAY_NAME).toBe("TweetReplyAI");
  });

  describe("PLAN_LIMITS — regression guard (update tests when limits change intentionally)", () => {
    it("trial plan: 10 credits, 10 replies", () => {
      expect(PLAN_LIMITS.trial.credits).toBe(10);
      expect(PLAN_LIMITS.trial.replies).toBe(10);
    });

    it("weekly plan: 100 credits, 700 replies", () => {
      expect(PLAN_LIMITS.weekly.credits).toBe(100);
      expect(PLAN_LIMITS.weekly.replies).toBe(700);
    });

    it("monthly plan: 10000 credits, 3000 replies", () => {
      expect(PLAN_LIMITS.monthly.credits).toBe(10000);
      expect(PLAN_LIMITS.monthly.replies).toBe(3000);
    });

    it("all three plan tiers are defined", () => {
      expect(PLAN_LIMITS.trial).toBeDefined();
      expect(PLAN_LIMITS.weekly).toBeDefined();
      expect(PLAN_LIMITS.monthly).toBeDefined();
    });
  });

  describe("PLAN_PERIODS_DAYS", () => {
    it("weekly period is 7 days", () => {
      expect(PLAN_PERIODS_DAYS.weekly).toBe(7);
    });

    it("monthly period is 30 days", () => {
      expect(PLAN_PERIODS_DAYS.monthly).toBe(30);
    });

    it("trial period is 7 days", () => {
      expect(PLAN_PERIODS_DAYS.trial).toBe(7);
    });
  });
});

