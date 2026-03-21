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
vi.mock("../../../server/services/feedback-analytics", () => ({
  feedbackAnalytics: {
    getQualityMetrics: vi.fn().mockResolvedValue({}),
    getRecommendations: vi.fn().mockResolvedValue([]),
  },
}));

describe("Quality Metrics Route - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("validates days query bounds (too high)", async () => {
    const res = await app.raw()
      .get("/api/quality/metrics?days=366")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ message: "Days must be between 1 and 365" });
  });

  it("treats days=0 as days=30 (falsy coercion via || 30) and returns 200", async () => {
    // The route uses `parseInt(days) || 30`, so 0 defaults to 30, which is valid (not 400)
    const res = await app.raw()
      .get("/api/quality/metrics?days=0")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 200 for days=1", async () => {
    const res = await app.raw()
      .get("/api/quality/metrics?days=1")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("metrics");
    expect(res.body).toHaveProperty("recommendations");
  });

  it("returns 200 for days=365", async () => {
    const res = await app.raw()
      .get("/api/quality/metrics?days=365")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
  });

  it("returns 200 with default days when no query param", async () => {
    const res = await app.raw()
      .get("/api/quality/metrics")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
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
    const res = await createTestApp(unauthApp).raw().get("/api/quality/metrics");
    expect(res.status).toBe(401);
  });

  it("returns 500 when service throws", async () => {
    const { feedbackAnalytics } = await import("../../../server/services/feedback-analytics");
    vi.mocked(feedbackAnalytics.getQualityMetrics).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .get("/api/quality/metrics?days=30")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Failed to fetch quality metrics");
  });
});

