import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import { createTestApp } from "../../helpers/request";

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
vi.mock("../../../server/services/dodo-payments", () => ({
  PLANS: {
    weekly: {
      code: "weekly",
      name: "Weekly Plan",
      price: 299,
      credits: 100,
      interval: "week",
      dodoPriceId: "price_weekly_test",
    },
    monthly: {
      code: "monthly",
      name: "Monthly Plan",
      price: 999,
      credits: 10000,
      interval: "month",
      dodoPriceId: "price_monthly_test",
    },
  },
  dodoPaymentsService: {
    createCheckoutSession: vi.fn(),
    getSubscription: vi.fn(),
    planCodeFromPriceId: vi.fn(),
    cancelSubscription: vi.fn(),
    constructWebhookEvent: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));

describe("Plans Route - Unit Tests", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("returns 200 with plans array", async () => {
    const res = await app.raw().get("/api/plans");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.plans)).toBe(true);
  });

  it("response contains weekly and monthly plan entries", async () => {
    const res = await app.raw().get("/api/plans");
    expect(res.status).toBe(200);
    const codes = res.body.plans.map((p: any) => p.code);
    expect(codes).toContain("weekly");
    expect(codes).toContain("monthly");
  });

  it("plan objects have all required public fields", async () => {
    const res = await app.raw().get("/api/plans");
    for (const plan of res.body.plans) {
      expect(plan).toHaveProperty("code");
      expect(plan).toHaveProperty("name");
      expect(plan).toHaveProperty("price");
      expect(plan).toHaveProperty("credits");
      expect(plan).toHaveProperty("interval");
    }
  });

  it("plan objects do NOT expose dodoPriceId (sensitive field stripped)", async () => {
    const res = await app.raw().get("/api/plans");
    for (const plan of res.body.plans) {
      expect(plan).not.toHaveProperty("dodoPriceId");
    }
  });

  it("does not require authentication (public endpoint)", async () => {
    // No Authorization header, no session — should still return 200
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: any, _res: any, next: any) => {
      req.user = null;
      req.isAuthenticated = () => false;
      req.logout = vi.fn((cb: any) => cb());
      next();
    });
    await setupRoutes(unauthApp);
    const res = await createTestApp(unauthApp).raw().get("/api/plans");
    expect(res.status).toBe(200);
  });
});
