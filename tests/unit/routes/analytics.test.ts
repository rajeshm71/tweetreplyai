import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import { createTestApp } from "../../helpers/request";
import { signTestJwt } from "../../helpers/jwt";

vi.mock("../../../server/replitAuth", () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "test-user" };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn(() => "test-user"),
}));
vi.mock("../../../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));

const { emptySimpleAnalytics } = vi.hoisted(() => {
  const emptySimpleAnalytics = {
    summary: {
      totalReplies: 0,
      avgQuality: 0,
      qualityTrend: 0,
      timeSavedHours: 0,
      highQualityCount: 0,
    },
    parameterBreakdown: [] as unknown[],
    activityTrend: [] as unknown[],
    insights: [] as unknown[],
  };
  return { emptySimpleAnalytics };
});

vi.mock("../../../server/services/feedback-analytics", () => ({
  feedbackAnalytics: {
    getSimpleAnalytics: vi.fn().mockResolvedValue(emptySimpleAnalytics),
    getFeedbackStats: vi.fn().mockResolvedValue({
      overall_quality: { upvotes: 0, downvotes: 0, upvote_percentage: 0 },
      by_model: {},
      recent_trends: [],
      quality_metrics: { avg_quality_score: 0, high_quality_replies: 0, low_quality_replies: 0, regeneration_rate: 0 },
    }),
    getRecommendations: vi.fn().mockResolvedValue([]),
  },
}));

describe("Analytics Routes - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("serves simple analytics payload", async () => {
    const res = await app.raw()
      .get("/api/analytics/simple")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ totalReplies: 0 });
  });

  it("passes days query param to getSimpleAnalytics", async () => {
    const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
    const res = await app.raw()
      .get("/api/analytics/simple?days=7")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(feedbackAnalytics.getSimpleAnalytics).toHaveBeenCalledWith("test-user", 7);
  });

  it("returns non-zero totalReplies when analytics data exists", async () => {
    const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
    vi.mocked(feedbackAnalytics.getSimpleAnalytics).mockResolvedValue({
      ...emptySimpleAnalytics,
      summary: { ...emptySimpleAnalytics.summary, totalReplies: 42 },
    } as any);

    const res = await app.raw()
      .get("/api/analytics/simple")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.totalReplies).toBe(42);
  });

  it("returns 401 when not authenticated", async () => {
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: any, _res: any, next: any) => {
      req.user = null;
      req.isAuthenticated = () => false;
      req.logout = vi.fn((cb: any) => cb());
      next();
    });
    await setupRoutes(unauthApp);

    const { createTestApp } = await import("../../helpers/request");
    const res = await createTestApp(unauthApp).raw().get("/api/analytics/simple");
    expect(res.status).toBe(401);
  });

  it("returns 400 when days is out of range", async () => {
    const res = await app.raw()
      .get("/api/analytics/simple?days=366")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Days must be between 1 and 365");
  });

  it("returns 500 when analytics service throws", async () => {
    const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
    vi.mocked(feedbackAnalytics.getSimpleAnalytics).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .get("/api/analytics/simple")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to fetch analytics");
  });

  // ── GET /api/analytics/feedback-stats ──────────────────────────────────────

  describe("GET /api/analytics/feedback-stats", () => {
    it("returns 200 with feedback stats", async () => {
      const res = await app.raw()
        .get("/api/analytics/feedback-stats")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(200);
    });

    it("passes days param to getFeedbackStats", async () => {
      const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
      const res = await app.raw()
        .get("/api/analytics/feedback-stats?days=7")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(feedbackAnalytics.getFeedbackStats).toHaveBeenCalledWith("test-user", 7);
    });

    it("defaults to 30 days when no query param", async () => {
      const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
      await app.raw()
        .get("/api/analytics/feedback-stats")
        .set("Authorization", `Bearer ${authToken}`);
      expect(feedbackAnalytics.getFeedbackStats).toHaveBeenCalledWith("test-user", 30);
    });

    it("returns 400 when days > 365", async () => {
      const res = await app.raw()
        .get("/api/analytics/feedback-stats?days=366")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message", "Days must be between 1 and 365");
    });

    it("returns 400 when days < 1", async () => {
      const res = await app.raw()
        .get("/api/analytics/feedback-stats?days=-5")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(400);
    });

    it("returns 401 when not authenticated", async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req: any, _res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = () => false;
        req.logout = vi.fn((cb: any) => cb());
        next();
      });
      await setupRoutes(unauthApp);
      const { createTestApp } = await import("../../helpers/request");
      const res = await createTestApp(unauthApp).raw().get("/api/analytics/feedback-stats");
      expect(res.status).toBe(401);
    });

    it("returns 500 when getFeedbackStats throws", async () => {
      const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
      vi.mocked(feedbackAnalytics.getFeedbackStats).mockRejectedValue(new Error("DB error"));
      const res = await app.raw()
        .get("/api/analytics/feedback-stats?days=30")
        .set("Authorization", `Bearer ${authToken}`);
      expect(res.status).toBe(500);
      expect(res.body.message).toBe("Failed to fetch feedback stats");
    });
  });
});

