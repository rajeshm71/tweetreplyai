/**
 * Tests for GET /api/checkout/success
 *
 * The route returns JSON (client fetch); use .query() for query params to avoid malformed URLs.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../../../server/routes";
import { signTestJwt } from "../../helpers/jwt";

const emailMocks = vi.hoisted(() => ({
  sendPaymentFailed: vi.fn().mockResolvedValue(undefined),
  sendSubscriptionActive: vi.fn().mockResolvedValue(undefined),
}));

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
vi.mock("../../../server/services/emailService", () => ({
  sendPaymentFailed: emailMocks.sendPaymentFailed,
  sendSubscriptionActive: emailMocks.sendSubscriptionActive,
  sendWelcome: vi.fn(),
  syncContactToResend: vi.fn(),
  sendUsageThreshold: vi.fn(),
  sendConversionStage: vi.fn(),
  sendActivationNudge: vi.fn(),
  sendWeeklyValue: vi.fn(),
  sendWinBack: vi.fn(),
  sendPasswordReset: vi.fn(),
  sendSubscriptionCanceled: vi.fn(),
  sendCampaignBatch: vi.fn(),
  unsubscribeContactInResend: vi.fn(),
}));

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
    emailMocks.sendPaymentFailed.mockResolvedValue(undefined);
    emailMocks.sendSubscriptionActive.mockResolvedValue(undefined);
    app = express();
    app.use(express.json());
    await setupRoutes(app);

    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");

    vi.mocked(storage.getUser).mockResolvedValue(mockStorageUser as any);
    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue(null);
    vi.mocked(storage.createSubscription).mockResolvedValue({ id: "sub-local-1" } as any);
    vi.mocked(storage.createUsageCounter).mockResolvedValue({} as any);

    vi.mocked(dodoPaymentsService.getSubscription).mockResolvedValue(mockDodoSubscription as any);
    vi.mocked(dodoPaymentsService.planCodeFromPriceId).mockReturnValue("weekly");
  });

  it("returns 200 JSON on new active subscription", async () => {
    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  it("creates subscription and usage counter for a new active subscription", async () => {
    const { storage } = await import("../../../server/storage");

    await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(storage.createSubscription).toHaveBeenCalled();
    expect(storage.createUsageCounter).toHaveBeenCalled();
  });

  it("returns 400 JSON when subscription_id is missing", async () => {
    const res = await request(app)
      .get("/api/checkout/success")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: "no_subscription" });
  });

  it("returns 404 JSON when user is not in DB", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue(null);

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: "user_not_found" });
  });

  it("returns 404 JSON when Dodo API returns 404 for subscription", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const err: any = new Error("Not found");
    err.status = 404;
    vi.mocked(dodoPaymentsService.getSubscription).mockRejectedValue(err);

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, error: "subscription_not_found" });
  });

  it("returns 500 JSON when Dodo API throws a generic error", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.getSubscription).mockRejectedValue(new Error("Network error"));

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ success: false, error: "checkout_failed" });
  });

  it("returns 400 JSON when planCodeFromPriceId returns null", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.planCodeFromPriceId).mockReturnValue(null);

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: "unknown_plan" });
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
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(storage.updateSubscription).toHaveBeenCalledWith(
      "sub-local-existing",
      expect.objectContaining({ status: "active" }),
    );
    expect(storage.createSubscription).not.toHaveBeenCalled();
  });

  it("returns 401 when not authenticated", async () => {
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
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-123" });

    expect(res.status).toBe(401);
  });

  it("returns 402 and invokes sendPaymentFailed once when Dodo subscription status is failed", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.getSubscription).mockResolvedValue({
      ...mockDodoSubscription,
      status: "failed",
    } as any);

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-failed" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ success: false, error: "payment_failed" });
    expect(emailMocks.sendPaymentFailed).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendPaymentFailed).toHaveBeenCalledWith("test-user", "dodo-sub-failed");
  });

  it("returns 402 and invokes sendPaymentFailed for past_due new subscription", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.getSubscription).mockResolvedValue({
      ...mockDodoSubscription,
      status: "past_due",
    } as any);

    const res = await request(app)
      .get("/api/checkout/success")
      .query({ subscription_id: "dodo-sub-pastdue" })
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(402);
    expect(res.body).toMatchObject({ success: false, error: "payment_failed" });
    expect(emailMocks.sendPaymentFailed).toHaveBeenCalledTimes(1);
    expect(emailMocks.sendPaymentFailed).toHaveBeenCalledWith("test-user", "dodo-sub-pastdue");
  });
});
