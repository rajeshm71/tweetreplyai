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
  PLANS: {
    weekly: {
      code: "weekly",
      name: "Weekly",
      price: 299,
      credits: 100,
      interval: "week",
      dodoPriceId: "price_weekly_test",
    },
  },
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
    createSubscription: vi.fn().mockResolvedValue({ id: "sub-row-1" }),
    updateSubscription: vi.fn(),
    getUserSubscriptions: vi.fn().mockResolvedValue([]),
  },
}));
vi.mock("../../../server/services/emailService", () => ({
  sendPaymentFailed: vi.fn().mockResolvedValue(undefined),
  sendSubscriptionCanceled: vi.fn().mockResolvedValue(undefined),
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

  it("subscription.updated with failed status calls sendPaymentFailed when prior status was active", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const { storage } = await import("../../../server/storage");
    const emailService = await import("../../../server/services/emailService");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "subscription.updated",
      data: {
        customer_email: "payfail@example.com",
        customer: { email: "payfail@example.com" },
        subscription_id: "sub_dodo_failed_1",
        id: "sub_dodo_failed_1",
        status: "failed",
      },
    } as any);

    vi.mocked(storage.getUserByEmail).mockResolvedValue({
      id: "user-payfail",
      email: "payfail@example.com",
    } as any);

    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue({
      id: "row-1",
      userId: "user-payfail",
      dodoSubscriptionId: "sub_dodo_failed_1",
      planCode: "weekly",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    vi.mocked(storage.updateSubscription).mockResolvedValue(undefined as any);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "subscription.updated" })));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith("user-payfail", "sub_dodo_failed_1");
  });

  it("subscription.created with failed status calls sendPaymentFailed and does not create subscription", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const { storage } = await import("../../../server/storage");
    const emailService = await import("../../../server/services/emailService");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "subscription.created",
      data: {
        customer_email: "failedcreate@example.com",
        customer: { email: "failedcreate@example.com" },
        subscription_id: "sub_created_failed_1",
        id: "sub_created_failed_1",
        status: "failed",
        product_id: "price_x",
        metadata: { product_id: "price_x" },
      },
    } as any);

    vi.mocked(storage.getUserByEmail).mockResolvedValue({
      id: "user-failed-create",
      email: "failedcreate@example.com",
    } as any);
    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "subscription.created" })));

    expect(res.status).toBe(200);
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith("user-failed-create", "sub_created_failed_1");
    expect(storage.createSubscription).not.toHaveBeenCalled();
  });

  it("subscription.created with past_due creates subscription and calls sendPaymentFailed", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const { storage } = await import("../../../server/storage");
    const emailService = await import("../../../server/services/emailService");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "subscription.created",
      data: {
        customer_email: "pastdue@example.com",
        customer: { email: "pastdue@example.com" },
        subscription_id: "sub_pastdue_new",
        id: "sub_pastdue_new",
        status: "past_due",
        product_id: "price_x",
        metadata: { product_id: "price_x" },
      },
    } as any);

    vi.mocked(storage.getUserByEmail).mockResolvedValue({
      id: "user-pastdue",
      email: "pastdue@example.com",
    } as any);
    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue(undefined);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "subscription.created" })));

    expect(res.status).toBe(200);
    expect(storage.createSubscription).toHaveBeenCalled();
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith("user-pastdue", "sub_pastdue_new");
  });

  it("subscription.created updates existing sub and calls sendPaymentFailed on transition to past_due", async () => {
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    const { storage } = await import("../../../server/storage");
    const emailService = await import("../../../server/services/emailService");

    vi.mocked(dodoPaymentsService.constructWebhookEvent).mockResolvedValue({
      type: "subscription.created",
      data: {
        customer_email: "existing@example.com",
        customer: { email: "existing@example.com" },
        subscription_id: "sub_existing_pd",
        id: "sub_existing_pd",
        status: "past_due",
        product_id: "price_x",
        metadata: { product_id: "price_x" },
      },
    } as any);

    vi.mocked(storage.getUserByEmail).mockResolvedValue({
      id: "user-existing",
      email: "existing@example.com",
    } as any);

    vi.mocked(storage.getSubscriptionByDodoId).mockResolvedValue({
      id: "row-existing",
      userId: "user-existing",
      dodoSubscriptionId: "sub_existing_pd",
      planCode: "weekly",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const res = await request(app)
      .post("/api/dodo/webhook")
      .set("webhook-id", "wid")
      .set("webhook-signature", "valid-sig")
      .set("webhook-timestamp", "ts")
      .send(Buffer.from(JSON.stringify({ type: "subscription.created" })));

    expect(res.status).toBe(200);
    expect(storage.updateSubscription).toHaveBeenCalled();
    expect(emailService.sendPaymentFailed).toHaveBeenCalledWith("user-existing", "sub_existing_pd");
  });
});

