/**
 * Dodo webhook path — SDK verification mocked; asserts HTTP contract only (no live Dodo calls).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";

vi.mock("../../server/services/dodo-payments", () => ({
  PLANS: {},
  dodoPaymentsService: {
    constructWebhookEvent: vi.fn().mockResolvedValue({
      type: "integration.unknown.event",
      data: {},
    }),
    planCodeFromPriceId: vi.fn(),
    getSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    createCustomerPortalSession: vi.fn(),
  },
}));

describe("Dodo webhook (integration)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    app = await createIntegrationApp();
  });

  it("returns 200 { received: true } when constructWebhookEvent succeeds", async () => {
    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid-inttest")
      .set("webhook-signature", "sig-inttest")
      .set("webhook-timestamp", String(Math.floor(Date.now() / 1000)))
      .send(Buffer.from(JSON.stringify({ type: "integration.unknown.event" })));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
  });
});
