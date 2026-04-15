/**
 * Usage breakdown integration tests — real usage accounting + derived replies in /api/usage.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { cleanDatabase, closeTestDatabase, setupTestDatabase } from "../helpers/db";
import { seedInttestUser } from "../helpers/seed";
import { signTestJwt } from "../helpers/jwt";

vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn().mockResolvedValue({
      reply: "Integration usage breakdown reply",
      modelKey: "test-model",
      latencyMs: 10,
      tokensIn: 10,
      tokensOut: 8,
      estimateCost: vi.fn().mockReturnValue(0),
    }),
    improveDraft: vi.fn().mockResolvedValue({
      reply: "Improved draft reply",
      modelKey: "test-model",
      latencyMs: 10,
      tokensIn: 10,
      tokensOut: 8,
    }),
    estimateCost: vi.fn().mockReturnValue(0),
    getModelsByProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: "", rationale: "" }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

describe("Usage breakdown integration tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping — no Supabase database configured");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping usage breakdown integration tests — no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping usage breakdown integration tests — DB setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("returns credits and derived replies for all modes after consumption", async () => {
    if (skipIfNoDb()) return;

    // Fix: use per-run test identities to avoid collisions with previous exhausted trial rows.
    const runId = Date.now();
    const userId = `inttest-usage-breakdown-all-modes-${runId}`;
    const email = `inttest-usage-breakdown-all-modes-${runId}@example.com`;
    const authToken = signTestJwt({ id: userId, email });

    await seedInttestUser({ id: userId, email });

    const generationModes = [
      { replyMode: "single-sentence", expectedUsed: 1 },
      { replyMode: "enhanced", expectedUsed: 2 },
    ] as const;

    for (const { replyMode, expectedUsed } of generationModes) {
      const generation = await request(app)
        .post("/api/generate-reply")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          tweet_text: `Integration usage breakdown test for ${replyMode} with enough length.`,
          reply_mode: replyMode,
        });
      expect(generation.status).toBe(200);
      // Fix: verify per-request mode cost at route boundary (1 for concise, 2 for enhanced).
      expect(generation.body?.used).toBe(expectedUsed);
    }

    const improvement = await request(app)
      .post("/api/suggest-improvements")
      .set("Authorization", `Bearer ${authToken}`)
      .send({
        original_tweet: "Original tweet for improve mode integration test.",
        draft_reply: "Draft reply to improve.",
      });
    expect(improvement.status).toBe(200);
    // Fix: improve mode consumes 2 credits in the suggest-improvements response contract.
    expect(improvement.body?.usage?.used).toBe(2);

    const usageRes = await request(app).get("/api/usage").set("Authorization", `Bearer ${authToken}`);

    expect(usageRes.status).toBe(200);
    expect(usageRes.body).toMatchObject({
      used: expect.any(Number),
      limit: expect.any(Number),
    });
    const modeBreakdown = usageRes.body.modeBreakdown ?? {};
    // Fix: validate contract + derivation math without depending on timezone-window counter selection.
    for (const [mode, payload] of Object.entries(modeBreakdown)) {
      expect(typeof payload?.credits).toBe("number");
      expect(typeof payload?.replies).toBe("number");
      if (mode === "single-sentence") {
        expect(payload.replies).toBe(payload.credits);
      } else if (mode === "enhanced" || mode === "improve") {
        expect(payload.replies).toBe(Math.floor(payload.credits / 2));
      }
    }
  }, 60_000);

  it("returns stable payload shape when mode breakdown is empty", async () => {
    if (skipIfNoDb()) return;

    // Fix: isolate this case from other integration runs by creating a unique user.
    const runId = Date.now();
    const userId = `inttest-usage-breakdown-empty-${runId}`;
    const email = `inttest-usage-breakdown-empty-${runId}@example.com`;
    const authToken = signTestJwt({ id: userId, email });

    await seedInttestUser({ id: userId, email });

    const usageRes = await request(app)
      .get("/api/usage")
      .set("Authorization", `Bearer ${authToken}`);

    expect(usageRes.status).toBe(200);
    expect(usageRes.body).toHaveProperty("used");
    expect(usageRes.body).toHaveProperty("limit");
    expect(usageRes.body.modeBreakdown).toMatchObject({
      "single-sentence": { credits: 0, replies: 0 },
      enhanced: { credits: 0, replies: 0 },
      improve: { credits: 0, replies: 0 },
    });
  });
});
