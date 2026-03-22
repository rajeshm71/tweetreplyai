/**
 * AI Generation Integration Tests (smoke) — AI + usage mocked to avoid cost.
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
    generateReply: vi.fn().mockResolvedValue({
      reply: "Integration test reply content",
      modelKey: "test-model",
      latencyMs: 42,
      tokensIn: 50,
      tokensOut: 20,
    }),
    estimateCost: vi.fn().mockReturnValue(0.001),
    getModelsByProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: null, rationale: "" }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

vi.mock("../../server/services/tweet-analysis-agents.js", () => ({
  tweetAnalysisOrchestrator: {
    analyzeTweet: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../server/services/usage", () => ({
  usageService: {
    canUseReply: vi.fn().mockResolvedValue({ canUse: true, reason: "trial" }),
    // Route reads creditsUsed / limit / resetAt on the returned counter — must not be undefined
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

describe("AI Generation Integration Tests (smoke)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;
  const authToken = signTestJwt({ id: INTEG_JWT_USER_IDS.ai, email: INTEG_EMAILS.ai });

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping AI generation integration tests — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.ai, email: INTEG_EMAILS.ai });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping AI generation integration tests — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("generate-reply returns 200 when usage is mocked", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        tweet_text: "Integration test tweet content with enough length for the pipeline.",
        reply_mode: "enhanced",
      });

    expect(res.status).toBe(200);
  });

  it("reply-history endpoint returns 200 for seeded user", async () => {
    if (skipIfNoDb()) return;

    const histRes = await request(app)
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);

    expect(histRes.status).toBe(200);
  });

  it("returns 401 without authentication token", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/generate-reply")
      .send({ tweet_text: "Unauthenticated tweet" });

    expect(res.status).toBe(401);
  });
});
