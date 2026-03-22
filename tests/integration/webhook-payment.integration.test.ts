/**
 * Dodo webhook payment.succeeded — constructWebhookEvent mocked; asserts HTTP + DB side effect.
 * DB column for Dodo customer id is still `stripe_customer_id` (see storage-supabase mapping).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { supabase } from "../../server/supabase.js";

vi.mock("../../server/services/dodo-payments", () => ({
  PLANS: {},
  dodoPaymentsService: {
    constructWebhookEvent: vi.fn().mockResolvedValue({
      type: "payment.succeeded",
      data: {
        customer_email: "inttest-webhook-pay@example.com",
        customer: {
          id: "cus_webhook_inttest",
          email: "inttest-webhook-pay@example.com",
        },
      },
    }),
    planCodeFromPriceId: vi.fn(),
    getSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));

describe("Dodo webhook payment.succeeded (integration)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping webhook payment integration — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({
        id: INTEG_JWT_USER_IDS.webhookPay,
        email: INTEG_EMAILS.webhookPay,
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping webhook payment integration — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("returns 200 { received: true } and persists stripe_customer_id for seeded user", async () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return;
    }

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid-inttest-pay")
      .set("webhook-signature", "sig-inttest")
      .set("webhook-timestamp", String(Math.floor(Date.now() / 1000)))
      .send(Buffer.from(JSON.stringify({ type: "payment.succeeded" })));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });

    const { data: row, error } = await supabase
      .from("users")
      .select("stripe_customer_id")
      .eq("id", INTEG_JWT_USER_IDS.webhookPay)
      .single();

    expect(error).toBeNull();
    expect(row?.stripe_customer_id).toBe("cus_webhook_inttest");
  });
});
