/**
 * Public catalog smoke — no DB; catches wiring regressions on plans/models/prompts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import { createIntegrationApp } from "../helpers/integration-app";

describe("Catalog (integration smoke)", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;

  beforeAll(async () => {
    app = await createIntegrationApp();
  });

  it("GET /api/plans returns 200 with plans array", async () => {
    const res = await request(app).get("/api/plans");
    expect(res.status).toBe(200);
    expect(typeof res.body).toBe("object");
    expect(Array.isArray(res.body.plans)).toBe(true);
    expect(res.body.plans.length).toBeGreaterThan(0);
  });

  it("GET /api/models returns 200 with object body", async () => {
    const res = await request(app).get("/api/models");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe("object");
  });

  it("GET /api/prompts returns 200 with object body", async () => {
    const res = await request(app).get("/api/prompts");
    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(typeof res.body).toBe("object");
  });
});
