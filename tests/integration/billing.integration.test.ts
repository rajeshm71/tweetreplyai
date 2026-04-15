/**
 * Billing Integration Tests — Dodo API mocked; asserts DB rows via Supabase.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { supabase } from "../../server/supabase";
import { storage } from "../../server/storage.js";

vi.mock("../../server/services/dodo-payments", () => ({
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
    getSubscription: vi.fn().mockResolvedValue({
      id: "dodo-inttest-sub-001",
      status: "active",
      product_id: "price_weekly_test",
      customer_id: "cust-inttest-001",
      customer: { id: "cust-inttest-001", email: "inttest-billing@example.com" },
      // Must be in the future or getActiveSubscription (gt current_period_end) returns no row
      current_period_start: "2030-01-01T00:00:00Z",
      current_period_end: "2030-01-15T00:00:00Z",
      amount_paid: 299,
      currency: "usd",
    }),
    planCodeFromPriceId: vi.fn().mockReturnValue("weekly"),
    cancelSubscription: vi.fn().mockResolvedValue({ status: "canceled" }),
    createCheckoutSession: vi.fn().mockResolvedValue({ url: "https://checkout.test/example" }),
    constructWebhookEvent: vi.fn(),
    createCustomerPortalSession: vi.fn().mockResolvedValue({ url: "https://portal.test/example" }),
  },
}));

describe("Billing Integration Tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({ id: INTEG_JWT_USER_IDS.billing, email: INTEG_EMAILS.billing });

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
      app = await createIntegrationApp();
      await seedInttestUser({
        id: INTEG_JWT_USER_IDS.billing,
        email: INTEG_EMAILS.billing,
      });
      await storage.updateUser(INTEG_JWT_USER_IDS.billing, {
        dodoCustomerId: "cus_inttest_portal",
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping billing integration tests — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("POST /api/checkout returns checkout_url from Dodo mock", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/checkout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ plan_code: "weekly" });

    expect(res.status).toBe(200);
    expect(res.body.checkout_url).toBe("https://checkout.test/example");
  });

  it("POST /api/billing/portal returns portal_url when user has dodoCustomerId", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/billing/portal")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.portal_url).toBe("https://portal.test/example");
  });

  it("checkout success redirects to subscription_activated and persists one subscription row", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect([301, 302]).toContain(res.status);
    expect(res.headers.location).toContain("subscription_activated");

    const { data: rows, error } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan_code, stripe_subscription_id")
      .eq("user_id", INTEG_JWT_USER_IDS.billing)
      .eq("stripe_subscription_id", "dodo-inttest-sub-001");

    expect(error).toBeNull();
    expect(rows?.length).toBe(1);
    expect(rows![0].plan_code).toBe("weekly");
  });

  it("idempotency — second checkout call updates same row (single dodo id per user)", async () => {
    if (skipIfNoDb()) return;

    await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    const res2 = await request(app)
      .get("/api/checkout/success?subscription_id=dodo-inttest-sub-001")
      .set("Authorization", `Bearer ${authToken}`)
      .redirects(0);

    expect([302, 301]).toContain(res2.status);

    const { data: rows } = await supabase
      .from("subscriptions")
      .select("id")
      .eq("user_id", INTEG_JWT_USER_IDS.billing)
      .eq("stripe_subscription_id", "dodo-inttest-sub-001");

    expect(rows?.length).toBe(1);
  });

  it("subscription status endpoint reflects DB state", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("hasSubscription");
    expect(res.body.hasSubscription).toBe(true);
    expect(res.body.planCode).toBe("weekly");
  });

  it("cancelling subscription updates row to canceled", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/subscription/cancel")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", INTEG_JWT_USER_IDS.billing)
      .eq("stripe_subscription_id", "dodo-inttest-sub-001")
      .maybeSingle();

    expect(sub?.status).toBe("canceled");
  });
});
