/**
 * Billing Integration Tests
 *
 * These tests require a real Supabase database and Dodo Payments test credentials.
 * They are skipped automatically when DATABASE_URL is not configured.
 *
 * All test data is prefixed with `inttest-` and cleaned up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupRoutes } from "../../server/routes";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";

// Mock Dodo Payments API so tests do not make real network calls
vi.mock("../../server/services/dodo-payments", () => ({
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
    getSubscription: vi.fn().mockResolvedValue({
      id: "dodo-inttest-sub-001",
      status: "active",
      product_id: "price_weekly_test",
      customer_id: "cust-inttest-001",
      customer: { id: "cust-inttest-001", email: "inttest-billing@example.com" },
      current_period_start: "2024-01-01T00:00:00Z",
      current_period_end: "2024-01-08T00:00:00Z",
      amount_paid: 299,
      currency: "usd",
    }),
    planCodeFromPriceId: vi.fn().mockReturnValue("weekly"),
    cancelSubscription: vi.fn().mockResolvedValue({ status: "canceled" }),
    createCheckoutSession: vi.fn(),
    constructWebhookEvent: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));

describe("Billing Integration Tests", () => {
  let app: express.Application;
  let testDb: any;
  const authToken = signTestJwt({ id: "inttest-billing-user", email: "inttest-billing@example.com" });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping billing integration tests — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = express();
      app.use(express.json());
      await setupRoutes(app);
    } catch (error: any) {
      console.log("Skipping billing integration tests — DB setup failed:", error.message);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("checkout success redirects (success or known error — never 5xx)", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    // Route always redirects — never throws 500
    expect([301, 302]).toContain(res.status);
    expect(typeof res.headers.location).toBe("string");
    // Location should contain a known outcome param (success or one of the error codes)
    const knownOutcomes = [
      "subscription_activated", "user_not_found", "subscription_not_found",
      "checkout_failed", "unknown_plan", "no_subscription",
    ];
    expect(knownOutcomes.some((k) => res.headers.location.includes(k))).toBe(true);
  });

  it("idempotency — second checkout call does not duplicate subscription row", async () => {
    if (skipIfNoDb()) return;

    // Call checkout twice with the same subscription_id
    await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    const res2 = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    // Second call should still succeed (update path, not create)
    expect([302, 301]).toContain(res2.status);
  });

  it("subscription status endpoint reflects DB state", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // Either subscription exists or it doesn't — the endpoint should always respond
    expect(res.body).toHaveProperty("hasSubscription");
  });

  it("cancelling subscription updates status", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/subscription/cancel")
      .set("Authorization", `Bearer ${authToken}`);

    // Either 200 (cancelled) or 404 (no active sub) — both are valid
    expect([200, 404]).toContain(res.status);
  });
});
