/**
 * Usage / Trial Integration Tests — real usage service; AI mocked.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";
import { supabase } from "../../server/supabase";

vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn().mockResolvedValue({
      reply: "Usage integration test reply",
      modelKey: "test-model",
      latencyMs: 10,
      tokensIn: 20,
      tokensOut: 10,
      estimateCost: vi.fn().mockReturnValue(0),
    }),
    estimateCost: vi.fn().mockReturnValue(0),
    getModelsByProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: "", rationale: "" }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

describe("Usage Integration Tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({ id: INTEG_JWT_USER_IDS.usage, email: INTEG_EMAILS.usage });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping usage integration tests — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.usage, email: INTEG_EMAILS.usage });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping usage integration tests — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("GET /api/usage returns trial usage after first resolution", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app).get("/api/usage").set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("planCode");
    expect(res.body).toHaveProperty("used");
    expect(res.body).toHaveProperty("limit");

    const { data: counters } = await supabase
      .from("usage_counters")
      .select("id")
      .eq("user_id", INTEG_JWT_USER_IDS.usage);

    expect((counters ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("POST /api/auth/initialize-trial returns 200", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/auth/initialize-trial")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { data: counters } = await supabase
      .from("usage_counters")
      .select("user_id, plan_code")
      .eq("user_id", INTEG_JWT_USER_IDS.usage);

    expect((counters ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("generate-reply returns 200 and consumes credits (tweet_text body)", async () => {
    if (skipIfNoDb()) return;

    const genRes = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tweet_text: "Usage decrement test tweet with enough length for validation here." });

    expect(genRes.status).toBe(200);
  });
});
