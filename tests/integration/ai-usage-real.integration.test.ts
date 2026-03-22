/**
 * Real usage + reply_history persistence — AI and guardrail mocked only (no usage mock).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { supabase } from "../../server/supabase.js";

vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn().mockResolvedValue({
      reply: "Real integration reply body",
      modelKey: "test-model",
      latencyMs: 12,
      tokensIn: 20,
      tokensOut: 15,
      estimateCost: vi.fn().mockReturnValue(0.001),
    }),
    estimateCost: vi.fn().mockReturnValue(0.001),
    getModelsByProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: "", rationale: "" }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

describe("AI + Usage (real) Integration Tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({ id: INTEG_JWT_USER_IDS.aiReal, email: INTEG_EMAILS.aiReal });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.aiReal, email: INTEG_EMAILS.aiReal });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("POST /api/generate-reply persists reply_history row", async () => {
    if (skipIfNoDb()) return;

    const tweet =
      "This is a long enough tweet text for the generate-reply integration test path to run correctly.";

    const res = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tweet_text: tweet });

    expect(res.status).toBe(200);

    const { data: rows } = await supabase
      .from("reply_history")
      .select("id, was_used, generated_reply")
      .eq("user_id", INTEG_JWT_USER_IDS.aiReal)
      .order("created_at", { ascending: false })
      .limit(1);

    expect(rows?.length).toBe(1);
    expect(rows![0].generated_reply).toContain("Real integration");
  });

  it("POST mark-used sets was_used in DB", async () => {
    if (skipIfNoDb()) return;

    const hist = await request(app)
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);

    expect(hist.status).toBe(200);
    const list = hist.body?.history ?? hist.body;
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);

    const entry = list[0];
    const markRes = await request(app)
      .post(`/api/reply-history/${entry.id}/mark-used`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(markRes.status).toBe(200);

    const { data: row } = await supabase
      .from("reply_history")
      .select("was_used")
      .eq("id", entry.id)
      .single();

    expect(row?.was_used).toBe(true);
  });

  it("returns 402 when user has no remaining quota (trial exhausted / no plan)", async () => {
    if (skipIfNoDb()) return;

    // Avoid flaky period_start matching between seeded counters and UsageService windows:
    // a user with hasUsedTrial=true and no subscription resolves to no_access → 402 before AI.
    await supabase.from("usage_counters").delete().eq("user_id", INTEG_JWT_USER_IDS.quota402);
    await seedInttestUser({
      id: INTEG_JWT_USER_IDS.quota402,
      email: INTEG_EMAILS.quota402,
      hasUsedTrial: true,
    });

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.quota402,
      email: INTEG_EMAILS.quota402,
    });

    const res = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${token}`)
      .send({
        tweet_text:
          "Another long tweet for quota test purposes so validation passes and usage gate runs.",
      });

    expect(res.status).toBe(402);
    expect(res.body).toHaveProperty("error");
  });
});
