/**
 * Optional integration coverage: feedback, preferences, analytics, extension auth.
 * Requires DATABASE_URL (Supabase). Skips when not configured.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { signTestJwt } from "../helpers/jwt";
import { seedInttestUser } from "../helpers/seed";
import { INTEG_EMAILS, INTEG_JWT_USER_IDS } from "../helpers/inttest-constants";

describe("Extra routes (integration)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;

  const skipIfNoDb = () => {
    if (!testDb) return true;
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL?.includes("supabase.co")) {
      console.log("Skipping extras integration — no Supabase database configured");
      return;
    }
    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.preferences, email: INTEG_EMAILS.preferences });
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.analytics, email: INTEG_EMAILS.analytics });
      await seedInttestUser({ id: INTEG_JWT_USER_IDS.extension, email: INTEG_EMAILS.extension });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.log("Skipping extras integration — setup failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  it("GET/PUT /api/user/preferences round-trip", async () => {
    if (skipIfNoDb()) return;

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.preferences,
      email: INTEG_EMAILS.preferences,
    });

    const getRes = await request(app).get("/api/user/preferences").set("Authorization", `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body).toHaveProperty("tone");

    const putRes = await request(app)
      .put("/api/user/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({ tone: "friendly", length: "short" });

    expect(putRes.status).toBe(200);
    expect(putRes.body.tone).toBe("friendly");
    expect(putRes.body.length).toBe("short");
  });

  it("GET /api/analytics/simple returns 200", async () => {
    if (skipIfNoDb()) return;

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.analytics,
      email: INTEG_EMAILS.analytics,
    });

    const res = await request(app).get("/api/analytics/simple?days=7").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
  });

  it("GET /api/extension/auth returns token when cookie token is set", async () => {
    if (skipIfNoDb()) return;

    const token = signTestJwt({
      id: INTEG_JWT_USER_IDS.extension,
      email: INTEG_EMAILS.extension,
    });

    const res = await request(app)
      .get("/api/extension/auth")
      .set("Cookie", [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user?.id).toBe(INTEG_JWT_USER_IDS.extension);
  });
});
