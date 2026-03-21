import { describe, expect, it, vi } from "vitest";

vi.mock("dodopayments", () => ({
  default: class DodoPaymentsMock {
    checkoutSessions = { create: vi.fn(), retrieve: vi.fn() };
    subscriptions = { retrieve: vi.fn(), update: vi.fn() };
    webhooks = { unwrap: vi.fn() };

    constructor(_args?: any) {
      // no-op: test only needs the instance shape to exist
    }
  },
}));

// [SMOKE] T3 — verifies module exports; planCodeFromPriceId behavioral cases should be added
describe("[SMOKE] Dodo Payments Service", () => {
  it("exports plan configuration", async () => {
    process.env.DODO_PAYMENTS_API_KEY = "test";
    const mod = await import("../../../server/services/dodo-payments");
    expect(mod.PLANS).toBeDefined();
    expect(typeof mod.dodoPaymentsService.planCodeFromPriceId).toBe("function");
  });
});

