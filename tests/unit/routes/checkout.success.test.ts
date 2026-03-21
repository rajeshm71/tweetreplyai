/**
 * Tests for GET /api/checkout/success
 *
 * This route is redirect-only — it never calls res.json().
 * All assertions use `res.status === 302` and `res.headers.location`.
 *
 * Supertest follows redirects by default; set .redirects(0) to capture
 * the 302 and Location header before any redirect is followed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../../../server/routes";
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
vi.mock("../../../server/storage", () => ({
  storage: {
    getUser: vi.fn(),
    upsertUser: vi.fn(),
    getSubscriptionByDodoId: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
    getUserSubscriptions: vi.fn().mockResolvedValue([]),
    createUsageCounter: vi.fn(),
  },
}));
vi.mock("../../../server/services/dodo-payments", () => ({
  PLANS: {
    weekly: {
      code: "weekly",
      name: "Weekly Plan",
      price: 299,
      replies: 700,
      credits: 100,
      interval: "week",
      dodoPriceId: "price_weekly_test",
    },
    monthly: {
      code: "monthly",
      name: "Monthly Plan",
      price: 999,
      replies: 3000,
      credits: 10000,
      interval: "month",
      dodoPriceId: "price_monthly_test",
    },
  },
  dodoPaymentsService: {
    getSubscription: vi.fn(),
    planCodeFromPriceId: vi.fn(),
    cancelSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    constructWebhookEvent: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));
vi.mock("../../../server/services/usage", () => ({
  usageService: { getUsageStatus: vi.fn(), canUseReply: vi.fn(), consumeReply: vi.fn(), initializeTrialForUser: vi.fn() },
}));

// A valid Dodo subscription object returned from the API
const mockDodoSubscription = {
  id: "dodo-sub-123",
  status: "active",
  product_id: "price_weekly_test",
  customer_id: "cust-123",
  customer: { id: "cust-123", email: "buyer@example.com" },
  current_period_start: "2024-01-01T00:00:00Z",
  current_period_end: "2024-01-08T00:00:00Z",
  amount_paid: 299,
  currency: "usd",
};

const mockStorageUser = {
  id: "test-user",
  email: "buyer@example.com",
  dodoCustomerId: null,
};

const authToken = signTestJwt({ id: "test-user", email: "buyer@example.com" });

describe("Checkout Success Route - Unit Tests", () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    await setupRoutes(app);

    // Default happy-path mocks
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");

    vi.mocked(storage.getUser).mockResolvedValue(mockStorageUser as any);
    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue(null); // new subscription
    vi.mocked(storage.createSubscription).mockResolvedValue({ id: "sub-local-1" } as any);
    vi.mocked(storage.createUsageCounter).mockResolvedValue({} as any);

    vi.mocked(dodoPaymentsService.getSubscription).mockResolvedValue(mockDodoSubscription as any);
    vi.mocked(dodoPaymentsService.planCodeFromPriceId).mockReturnValue("weekly");
  });

  it("redirects to /?success=subscription_activated on new subscription", async () => {
    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("subscription_activated");
  });

  it("creates subscription and usage counter for a new subscription", async () => {
    const { storage } = await import("../../../server/storage");

    await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(storage.createSubscription).toHaveBeenCalled();
    expect(storage.createUsageCounter).toHaveBeenCalled();
  });

  it("redirects to /?error=no_subscription when subscription_id is missing", async () => {
    const res = await request(app)
      .get("/api/checkout/success")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=no_subscription");
  });

  it("redirects to /?error=user_not_found when user is not in DB", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=user_not_found");
  });

  it("redirects to /?error=subscription_not_found when Dodo API returns 404", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const err: any = new Error("Not found");
    err.status = 404;
    vi.mocked(dodoPaymentsService.getSubscription).mockRejectedValue(err);

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=subscription_not_found");
  });

  it("redirects to /?error=checkout_failed when Dodo API throws a generic error", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.getSubscription).mockRejectedValue(new Error("Network error"));

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=checkout_failed");
  });

  it("redirects to /?error=unknown_plan when planCodeFromPriceId returns null", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.planCodeFromPriceId).mockReturnValue(null);

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain("error=unknown_plan");
  });

  it("updates existing subscription instead of creating new one (idempotency)", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue({
      id: "sub-local-existing",
      userId: "test-user",
      planCode: "weekly",
      status: "active",
    } as any);

    await request(app)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect(storage.updateSubscription).toHaveBeenCalledWith(
      "sub-local-existing",
      expect.objectContaining({ status: "active" })
    );
    expect(storage.createSubscription).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
    // Override isAuthenticated to reject
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: any, res: any, next: any) => {
      req.user = null;
      req.isAuthenticated = () => false;
      req.logout = vi.fn((cb: any) => cb());
      next();
    });
    await setupRoutes(unauthApp);

    const res = await request(unauthApp)
      .get("/api/checkout/success?subscription_id=dodo-sub-123")
      .redirects(0);

    expect(res.status).toBe(401);
  });
});
