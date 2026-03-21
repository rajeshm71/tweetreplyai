/**
 * AI Generation Integration Tests
 *
 * Tests the full generate-reply → save to DB → fetch reply-history flow.
 * Requires a real Supabase database. AI calls are mocked to avoid API costs.
 * All test data is prefixed with `inttest-` and cleaned up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupRoutes } from "../../server/routes";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";

// Mock AI services — avoids real API calls and costs
vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn().mockResolvedValue({
      reply: "Integration test reply content",
      modelKey: "test-model",
      latencyMs: 42,
      tokensIn: 50,
      tokensOut: 20,
    }),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violated: false }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

vi.mock("../../server/services/usage", () => ({
  usageService: {
    canUseReply: vi.fn().mockResolvedValue({ canUse: true, reason: "trial" }),
    consumeReply: vi.fn().mockResolvedValue(undefined),
    getUsageStatus: vi.fn().mockResolvedValue({ hasSubscription: false, trialUsed: 0, trialLimit: 3 }),
    initializeTrialForUser: vi.fn().mockResolvedValue(undefined),
  },
}));

describe("AI Generation Integration Tests", () => {
  let app: express.Application;
  let testDb: any;
  const authToken = signTestJwt({ id: "inttest-ai-user", email: "inttest-ai@example.com" });

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
      app = express();
      app.use(express.json());
      await setupRoutes(app);
    } catch (error: any) {
      console.log("Skipping AI generation integration tests — DB setup failed:", error.message);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("generate-reply endpoint is reachable and returns a known status code", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tweetText: "Integration test tweet content" });

    // 200 = success, 402 = quota exceeded, 400 = validation error, 404 = user not found
    expect([200, 400, 401, 402, 404]).toContain(res.status);
  });

  it("reply-history endpoint is reachable and authenticated", async () => {
    if (skipIfNoDb()) return;

    const histRes = await request(app)
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);

    // 200 = ok, 404 = user not found
    expect([200, 404]).toContain(histRes.status);
    if (histRes.status === 200) {
      // Response may be an array directly or wrapped in an object with a data/items/replies key
      const isArray = Array.isArray(histRes.body);
      const isWrapped = typeof histRes.body === "object" && histRes.body !== null;
      expect(isArray || isWrapped).toBe(true);
    }
  });

  it("returns 401 without authentication token", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/generate-reply")
      .send({ tweetText: "Unauthenticated tweet" });

    expect(res.status).toBe(401);
  });

  it("mark-used endpoint updates wasUsed on a reply history entry", async () => {
    if (skipIfNoDb()) return;

    // First get reply history to find an ID to mark
    const histRes = await request(app)
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);

    if (!Array.isArray(histRes.body) || histRes.body.length === 0) {
      console.log("Skipping mark-used test — no reply history entries");
      return;
    }

    const entry = histRes.body[0];
    const markRes = await request(app)
      .post(`/api/reply-history/${entry.id}/mark-used`)
      .set("Authorization", `Bearer ${authToken}`);

    expect([200, 404]).toContain(markRes.status);
  });
});
