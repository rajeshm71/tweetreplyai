/**
 * Subscription Integration Tests — Dodo mocked; DB assertions on planCode and cancel.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { supabase } from "../../server/supabase";

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
      id: "dodo-inttest-sub-002",
      status: "active",
      product_id: "price_monthly_test",
      customer_id: "cust-inttest-002",
      customer: { id: "cust-inttest-002", email: "inttest-subscription@example.com" },
      current_period_start: "2030-01-01T00:00:00Z",
      current_period_end: "2030-03-01T00:00:00Z",
      amount_paid: 999,
      currency: "usd",
    }),
    planCodeFromPriceId: vi.fn().mockReturnValue("monthly"),
    cancelSubscription: vi.fn().mockResolvedValue({ status: "canceled" }),
    createCheckoutSession: vi.fn(),
    constructWebhookEvent: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));

describe("Subscription Integration Tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({
    id: INTEG_JWT_USER_IDS.subscription,
    email: INTEG_EMAILS.subscription,
  });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping subscription integration tests — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({
        id: INTEG_JWT_USER_IDS.subscription,
        email: INTEG_EMAILS.subscription,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping subscription integration tests — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("subscription status before checkout: no subscription", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.hasSubscription).toBe(false);
  });

  it("checkout success activates monthly plan in DB", async () => {
    if (skipIfNoDb()) return;

    const checkoutRes = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-002")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect([301, 302]).toContain(checkoutRes.status);
    expect(checkoutRes.headers.location).toContain("subscription_activated");

    const { data: row } = await supabase
      .from("subscriptions")
      .select("plan_code, status")
      .eq("user_id", INTEG_JWT_USER_IDS.subscription)
      .eq("stripe_subscription_id", "dodo-inttest-sub-002")
      .maybeSingle();

    expect(row?.plan_code).toBe("monthly");
    expect(row?.status).toBe("active");

    const statusRes = await request(app)
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.hasSubscription).toBe(true);
    expect(statusRes.body.planCode).toBe("monthly");
  });

  it("cancel subscription updates row to canceled", async () => {
    if (skipIfNoDb()) return;

    const cancelRes = await request(app)
      .post("/api/subscription/cancel")
      .set("Authorization", `Bearer ${authToken}`);

    expect(cancelRes.status).toBe(200);

    const { data: row } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", INTEG_JWT_USER_IDS.subscription)
      .eq("stripe_subscription_id", "dodo-inttest-sub-002")
      .maybeSingle();

    expect(row?.status).toBe("canceled");
  });
});
