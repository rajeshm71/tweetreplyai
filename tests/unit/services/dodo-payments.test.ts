import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Shared vi.fn() references — these persist across vi.resetModules() calls
// because they live in the test file scope, not inside the mock factory.
const mockCheckoutCreate = vi.fn();
const mockCheckoutRetrieve = vi.fn();
const mockSubscriptionRetrieve = vi.fn();
const mockSubscriptionUpdate = vi.fn();
const mockWebhooksUnwrap = vi.fn();

vi.mock("dodopayments", () => ({
  default: class DodoPaymentsMock {
    checkoutSessions = { create: mockCheckoutCreate, retrieve: mockCheckoutRetrieve };
    subscriptions = { retrieve: mockSubscriptionRetrieve, update: mockSubscriptionUpdate };
    webhooks = { unwrap: mockWebhooksUnwrap };

    constructor(_args?: any) {
      // no-op: test only needs the instance shape to exist
    }
  },
}));

describe("Dodo Payments Service - Unit Tests", () => {
  // Reset modules before each test so env vars are picked up fresh by PLANS
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DODO_PAYMENTS_API_KEY", "test-key");
    vi.stubEnv("DODO_PRICE_WEEKLY", "price_weekly_test");
    vi.stubEnv("DODO_PRICE_MONTHLY", "price_monthly_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("PLANS constant", () => {
    it("has weekly and monthly keys", async () => {
      const { PLANS } = await import("../../../server/services/dodo-payments");
      expect(PLANS).toHaveProperty("weekly");
      expect(PLANS).toHaveProperty("monthly");
    });

    it("weekly plan has all required fields", async () => {
      const { PLANS } = await import("../../../server/services/dodo-payments");
      const w = PLANS.weekly;
      expect(w).toHaveProperty("code", "weekly");
      expect(w).toHaveProperty("name");
      expect(w).toHaveProperty("price");
      expect(w).toHaveProperty("credits");
      expect(w).toHaveProperty("interval", "week");
      expect(w).toHaveProperty("dodoPriceId");
    });

    it("monthly plan has all required fields", async () => {
      const { PLANS } = await import("../../../server/services/dodo-payments");
      const m = PLANS.monthly;
      expect(m).toHaveProperty("code", "monthly");
      expect(m).toHaveProperty("interval", "month");
    });
  });

  describe("planCodeFromPriceId", () => {
    it("returns 'weekly' for the weekly price ID", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      expect(dodoPaymentsService.planCodeFromPriceId("price_weekly_test")).toBe("weekly");
    });

    it("returns 'monthly' for the monthly price ID", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      expect(dodoPaymentsService.planCodeFromPriceId("price_monthly_test")).toBe("monthly");
    });

    it("returns null for an unknown price ID", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      expect(dodoPaymentsService.planCodeFromPriceId("price_unknown_xyz")).toBeNull();
    });

    it("returns null for an empty string", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      expect(dodoPaymentsService.planCodeFromPriceId("")).toBeNull();
    });

    it("is case-sensitive (does not match wrong-cased ID)", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      // Price IDs are exact strings — wrong case should not match
      expect(dodoPaymentsService.planCodeFromPriceId("PRICE_WEEKLY_TEST")).toBeNull();
    });
  });

  describe("createCheckoutSession", () => {
    it("calls SDK checkoutSessions.create and returns session data", async () => {
      mockCheckoutCreate.mockResolvedValue({
        id: "session-123",
        checkout_url: "https://checkout.dodo.com/session-123",
        customer_id: "cust-456",
      });

      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      const result = await dodoPaymentsService.createCheckoutSession(
        "weekly",
        "user-1",
        "buyer@example.com",
        "https://app.com/success",
        "https://app.com/cancel"
      );

      expect(mockCheckoutCreate).toHaveBeenCalled();
      expect(result).toHaveProperty("url", "https://checkout.dodo.com/session-123");
      expect(result).toHaveProperty("id", "session-123");
    });

    it("throws for an invalid plan code", async () => {
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await expect(
        dodoPaymentsService.createCheckoutSession("invalid_plan", "u1", "e@e.com", "/ok", "/cancel")
      ).rejects.toThrow("Invalid plan code: invalid_plan");
    });

    it("propagates SDK error from createCheckoutSession", async () => {
      mockCheckoutCreate.mockRejectedValue(new Error("Payment gateway unavailable"));
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await expect(
        dodoPaymentsService.createCheckoutSession("weekly", "u1", "e@e.com", "/ok", "/cancel")
      ).rejects.toThrow("Payment gateway unavailable");
    });
  });

  describe("getSubscription", () => {
    it("calls SDK subscriptions.retrieve and returns the subscription object", async () => {
      const mockSub = { id: "sub-123", status: "active", product_id: "price_weekly_test" };
      mockSubscriptionRetrieve.mockResolvedValue(mockSub);

      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      const result = await dodoPaymentsService.getSubscription("sub-123");

      expect(mockSubscriptionRetrieve).toHaveBeenCalledWith("sub-123");
      expect(result).toEqual(mockSub);
    });

    it("propagates error when SDK subscriptions.retrieve throws", async () => {
      mockSubscriptionRetrieve.mockRejectedValue(new Error("Network error"));
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await expect(dodoPaymentsService.getSubscription("sub-bad")).rejects.toThrow("Network error");
    });
  });

  describe("cancelSubscription", () => {
    it("calls SDK subscriptions.update with cancel_at_period_end=true", async () => {
      mockSubscriptionUpdate.mockResolvedValue({});

      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await dodoPaymentsService.cancelSubscription("sub-123");

      expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
        "sub-123",
        expect.objectContaining({ cancel_at_period_end: true })
      );
    });

    it("wraps SDK error in a descriptive 'Failed to cancel subscription' message", async () => {
      mockSubscriptionUpdate.mockRejectedValue(new Error("Subscription not found"));
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await expect(dodoPaymentsService.cancelSubscription("sub-bad")).rejects.toThrow(
        "Failed to cancel subscription:"
      );
    });
  });

  describe("constructWebhookEvent", () => {
    it("calls webhooks.unwrap and returns event type from event_type field", async () => {
      mockWebhooksUnwrap.mockReturnValue({ event_type: "subscription.created" });
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      const result = await dodoPaymentsService.constructWebhookEvent(
        '{"event_type":"subscription.created"}',
        { "webhook-id": "id1", "webhook-signature": "sig1", "webhook-timestamp": "ts1" }
      );
      expect(mockWebhooksUnwrap).toHaveBeenCalled();
      expect(result).toHaveProperty("type", "subscription.created");
    });

    it("handles Buffer payload by converting to string before unwrapping", async () => {
      mockWebhooksUnwrap.mockReturnValue({ event_type: "payment.succeeded" });
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      const result = await dodoPaymentsService.constructWebhookEvent(
        Buffer.from('{"event_type":"payment.succeeded"}'),
        { "webhook-id": "id2", "webhook-signature": "sig2", "webhook-timestamp": "ts2" }
      );
      expect(result).toHaveProperty("type", "payment.succeeded");
    });

    it("wraps webhook verification error in a 'Webhook processing failed' message", async () => {
      mockWebhooksUnwrap.mockImplementation(() => {
        throw new Error("Invalid signature");
      });
      const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
      await expect(
        dodoPaymentsService.constructWebhookEvent("payload", {
          "webhook-id": "id3",
          "webhook-signature": "bad-sig",
          "webhook-timestamp": "ts3",
        })
      ).rejects.toThrow("Webhook processing failed:");
    });
  });
});
