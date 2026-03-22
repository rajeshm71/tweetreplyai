/**
 * POST /api/feedback — requires reply_event FK; asserts DB row.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { storage } from "../../server/storage.js";
import { supabase } from "../../server/supabase.js";

describe("Feedback (integration)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;

  const skipIfNoDb = () => !testDb;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping feedback integration — no Supabase database configured");
      return;
    }
    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.feedback, email: INTEG_EMAILS.feedback });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("Skipping feedback integration — setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("POST /api/feedback returns 200 and persists feedback row", async () => {
    if (skipIfNoDb()) return;

    const ev = await storage.createReplyEvent({
      id: randomUUID(),
      userId: INTEG_JWT_USER_IDS.feedback,
      modelKey: "inttest-model",
      promptKey: "inttest-prompt",
      latencyMs: 10,
      tokensUsed: 5,
      cost: 0.001,
    });

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.feedback,
      email: INTEG_EMAILS.feedback,
    });

    const replyEventId = Number(ev.id);
    expect(Number.isFinite(replyEventId)).toBe(true);

    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ reply_event_id: replyEventId, rating: "up", comment: "integration" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { data: rows, error } = await supabase
      .from("feedback")
      .select("id, rating, reply_event_id")
      .eq("reply_event_id", ev.id);

    expect(error).toBeNull();
    expect((rows ?? []).length).toBeGreaterThanOrEqual(1);
    expect(rows![0].rating).toBe("up");
  });

  it("POST /api/feedback returns 400 without reply_event_id", async () => {
    if (skipIfNoDb()) return;

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.feedback,
      email: INTEG_EMAILS.feedback,
    });

    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: "down" });

    expect(res.status).toBe(400);
  });
});
