/**
 * Resend webhook must receive raw JSON bytes before express.json() for Svix verification.
 * Mirrors server/index.ts middleware order.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import request from "supertest";
import { setupRoutes } from "../../../server/routes";

vi.mock("../../../server/replitAuth", () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn(() => "test"),
}));
vi.mock("../../../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));
vi.mock("../../../server/storage", () => ({
  storage: {
    updateEmailSendLogByResendMessageId: vi.fn().mockResolvedValue(undefined),
    updateEmailSendLog: vi.fn().mockResolvedValue(undefined),
    getUserByEmail: vi.fn().mockResolvedValue(undefined),
    upsertEmailPreferences: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("../../../server/services/emailService", () => ({
  unsubscribeContactInResend: vi.fn().mockResolvedValue(undefined),
}));

describe("POST /api/webhooks/resend", () => {
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.RESEND_WEBHOOK_SECRET;
  });

  afterAll(() => {
    if (originalSecret !== undefined) {
      process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    } else {
      delete process.env.RESEND_WEBHOOK_SECRET;
    }
  });

  it("returns 200 and parses JSON payload when raw body runs before express.json (no secret)", async () => {
    const app = express();
    app.use("/api/webhooks/resend", express.raw({ type: "application/json" }));
    app.use(express.json());
    await setupRoutes(app);

    const res = await request(app)
      .post("/api/webhooks/resend")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "email.sent", data: { email_id: "re_test" } }));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
