/**
 * Suggest-improvements integration — AI + usage mocked (no LLM cost).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";

vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn(),
    improveDraft: vi.fn().mockResolvedValue({
      reply: "Integration improved draft reply text.",
      modelKey: "test-model",
      latencyMs: 12,
      tokensIn: 20,
      tokensOut: 15,
    }),
    estimateCost: vi.fn().mockReturnValue(0.001),
    getModelsByProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: null, rationale: "" }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

vi.mock("../../server/services/usage", () => ({
  usageService: {
    canUseReply: vi.fn().mockResolvedValue({ canUse: true, reason: "trial" }),
    consumeReply: vi.fn().mockResolvedValue({
      repliesUsed: 1,
      creditsUsed: 2,
      limit: 100,
      resetAt: new Date(Date.now() + 86400000),
    }),
    getUsageStatus: vi.fn().mockResolvedValue({
      hasSubscription: false,
      trialUsed: 0,
      trialLimit: 3,
    }),
    initializeTrialForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("Suggest improvements (integration smoke)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({ id: INTEG_JWT_USER_IDS.suggest, email: INTEG_EMAILS.suggest });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping suggest-improvements integration — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.suggest, email: INTEG_EMAILS.suggest });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping suggest-improvements integration — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("POST /api/suggest-improvements returns 200 when AI and usage are mocked", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/suggest-improvements")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        draft_reply: "Thanks for sharing this — great point about the topic.",
        original_tweet: "Here is an original tweet with enough content for the suggest-improvements route.",
      });

    expect(res.status).toBe(200);
    expect(res.body.improved).toBeDefined();
    expect(res.body.usage).toBeDefined();
  });
});
