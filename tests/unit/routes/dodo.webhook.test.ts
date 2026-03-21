import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import request from "supertest";

vi.mock("../../../server/replitAuth", () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn(() => "test-user"),
}));
vi.mock("../../../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));
vi.mock("../../../server/services/dodo-payments", () => ({
  PLANS: {},
  dodoPaymentsService: {
    constructWebhookEvent: vi.fn(),
    planCodeFromPriceId: vi.fn(() => "weekly"),
  },
}));
vi.mock("../../../server/storage", () => ({
  storage: {
    getUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUser: vi.fn(),
    upsertUser: vi.fn(),
    getSubscriptionByDodoId: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
  },
}));

describe("Dodo Webhook Route - Unit Tests", () => {
  let app: express.Express;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.raw({ type: "application/json" }));
    await setupRoutes(app);
  });

  it("returns 400 or 500 when signature verification fails", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockRejectedValue(new Error("invalid signature"));
    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({})));
    expect([400, 500]).toContain(res.status);
  });

  it("returns 200 with { received: true } for payment.succeeded event", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const { storage } = await import("../../../server/storage");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "payment.succeeded",
      data: { customer_email: "user@example.com", customer: { email: "user@example.com" } },
    } as any);
    vi.mocked(storage.getUserByEmail).mockResolvedValue({ id: "user-1", email: "user@example.com", dodoCustomerId: "cus-1" } as any);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "payment.succeeded" })));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
  });

  it("returns 200 for unknown event type (ack and ignore)", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "some.unknown.event",
      data: {},
    } as any);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "some.unknown.event" })));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
  });
});

