import { test, expect } from "@playwright/test";

test.describe("Public API smoke", () => {
  test("GET /api/plans returns plans array", async ({ request }) => {
    const res = await request.get("/api/plans");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("plans");
    expect(Array.isArray(body.plans)).toBe(true);
  });

  test("GET /api/models returns object", async ({ request }) => {
    const res = await request.get("/api/models");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("GET /api/prompts returns JSON body", async ({ request }) => {
    const res = await request.get("/api/prompts");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe("object");
  });

  test("GET /api/auth/user without session returns 401", async ({ request }) => {
    const res = await request.get("/api/auth/user");
    expect(res.status()).toBe(401);
  });
});
