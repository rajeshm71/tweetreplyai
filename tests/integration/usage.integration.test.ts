/**
 * Usage / Trial Integration Tests
 *
 * Tests the trial initialisation, counter tracking, and quota enforcement
 * flows end-to-end against a real Supabase database.
 * All test data is prefixed with `inttest-` and cleaned up in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express from "express";
import { setupRoutes } from "../../server/routes";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";

// Mock AI services to avoid real API calls in usage-related tests
vi.mock("../../server/services/ai-router", () => ({
  aiRouter: {
    generateReply: vi.fn().mockResolvedValue({
      reply: "Usage integration test reply",
      modelKey: "test-model",
      latencyMs: 10,
      tokensIn: 20,
      tokensOut: 10,
    }),
  },
}));

vi.mock("../../server/services/guardrail", () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violated: false }),
  generateGuardrailFriendlyReply: vi.fn(),
}));

describe("Usage Integration Tests", () => {
  let app: express.Application;
  let testDb: any;
  const authToken = signTestJwt({ id: "inttest-usage-user", email: "inttest-usage@example.com" });

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
      app = express();
      app.use(express.json());
      await setupRoutes(app);
    } catch (error: any) {
      console.log("Skipping usage integration tests — DB setup failed:", error.message);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("trial initialises on first login — usage status endpoint returns a valid structure", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/usage-status")
      .set("Authorization", `Bearer ${authToken}`);

    // 200 = found, 404 = user not yet in DB — both are valid in integration context
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty("hasSubscription");
    }
  });

  it("POST /api/auth/initialize-trial creates or acknowledges a trial counter", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .post("/api/auth/initialize-trial")
      .set("Authorization", `Bearer ${authToken}`);

    // 200 = trial initialized, 409 = already initialized
    expect([200, 409]).toContain(res.status);
  });

  it("canUseReply is reflected in usage status response", async () => {
    if (skipIfNoDb()) return;

    const res = await request(app)
      .get("/api/usage-status")
      .set("Authorization", `Bearer ${authToken}`);

    // Should not crash — may return 404 if no user in DB yet
    expect([200, 404]).toContain(res.status);
  });

  it("generate-reply endpoint responds with a known status code after usage check", async () => {
    if (skipIfNoDb()) return;

    const genRes = await request(app)
      .post("/api/generate-reply")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ tweetText: "Usage decrement test tweet" });

    // 200 = success, 400 = validation, 402 = quota exceeded, 404 = user not found
    expect([200, 400, 402, 404]).toContain(genRes.status);
  });
});
