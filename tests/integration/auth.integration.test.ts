import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from "../helpers/db";
import { createIntegrationApp } from "../helpers/integration-app";
import { cookieHeaderFromSetCookie } from "../helpers/cookies";
import { seedInttestUser } from "../helpers/seed";
import { signTestJwt } from "../helpers/jwt";

describe("Authentication Integration Tests", () => {
  let app: Awaited<ReturnType<typeof createIntegrationApp>>;
  let testDb: unknown;

  const skipIfNoDb = () => {
    if (!testDb) {
      console.log("Skipping test - no database connection");
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes("supabase.co")) {
      console.log("Skipping integration tests - no Supabase database configured");
      return;
    }

    try {
      testDb = await setupTestDatabase();
      app = await createIntegrationApp();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log("Skipping integration tests - database connection failed:", msg);
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  describe("Full Authentication Flow", () => {
    it("should complete registration, login, logout flow", async () => {
      if (skipIfNoDb()) return;
      const suffix = Date.now();
      const userData = {
        email: `inttest-auth-flow-${suffix}@example.com`,
        password: "Password123",
        firstName: "Integration",
        lastName: "Test",
      };

      // Agent persists Set-Cookie (including clears from logout) — do not reuse raw login Cookie header after logout
      const agent = request.agent(app);

      const registerResponse = await agent.post("/api/auth/register").send(userData);
      expect(registerResponse.status).toBe(200);
      expect(registerResponse.body).toHaveProperty("user");
      expect(registerResponse.body.user.email).toBe(userData.email);

      const loginResponse = await agent.post("/api/auth/login").send({
        email: userData.email,
        password: userData.password,
      });
      expect(loginResponse.status).toBe(200);

      const userResponse = await agent.get("/api/auth/user");
      expect(userResponse.status).toBe(200);
      expect(userResponse.body.email).toBe(userData.email);

      const logoutResponse = await agent.post("/api/auth/logout");
      expect(logoutResponse.status).toBe(200);

      const afterLogout = await agent.get("/api/auth/user");
      expect(afterLogout.status).toBe(401);
    });

    it("should handle session persistence across requests", async () => {
      if (skipIfNoDb()) return;
      const suffix = Date.now();
      const userData = {
        email: `inttest-auth-session-${suffix}@example.com`,
        password: "Password123",
        firstName: "Session",
        lastName: "Test",
      };

      await request(app).post("/api/auth/register").send(userData);
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: userData.email,
        password: userData.password,
      });
      const cookieHeader = cookieHeaderFromSetCookie(loginResponse.headers["set-cookie"]);
      expect(cookieHeader).toBeDefined();

      for (let i = 0; i < 3; i++) {
        const userResponse = await request(app).get("/api/auth/user").set("Cookie", cookieHeader!);
        expect(userResponse.status).toBe(200);
        expect(userResponse.body.email).toBe(userData.email);
      }
    });

    it("should reject wrong password", async () => {
      if (skipIfNoDb()) return;
      const suffix = Date.now();
      const userData = {
        email: `inttest-auth-password-${suffix}@example.com`,
        password: "Password123",
        firstName: "Password",
        lastName: "Test",
      };

      await request(app).post("/api/auth/register").send(userData);
      const wrong = await request(app).post("/api/auth/login").send({
        email: userData.email,
        password: "wrongpassword",
      });
      expect(wrong.status).toBe(401);

      const ok = await request(app).post("/api/auth/login").send({
        email: userData.email,
        password: userData.password,
      });
      expect(ok.status).toBe(200);
    });

    it("should handle concurrent user sessions", async () => {
      if (skipIfNoDb()) return;
      const t = Date.now();
      const u1 = {
        email: `inttest-auth-c1-${t}@example.com`,
        password: "Password123",
        firstName: "User",
        lastName: "One",
      };
      const u2 = {
        email: `inttest-auth-c2-${t}@example.com`,
        password: "Password123",
        firstName: "User",
        lastName: "Two",
      };

      await request(app).post("/api/auth/register").send(u1);
      await request(app).post("/api/auth/register").send(u2);

      const l1 = await request(app).post("/api/auth/login").send({ email: u1.email, password: u1.password });
      const l2 = await request(app).post("/api/auth/login").send({ email: u2.email, password: u2.password });
      const c1 = cookieHeaderFromSetCookie(l1.headers["set-cookie"]);
      const c2 = cookieHeaderFromSetCookie(l2.headers["set-cookie"]);
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();

      const r1 = await request(app).get("/api/auth/user").set("Cookie", c1!);
      const r2 = await request(app).get("/api/auth/user").set("Cookie", c2!);
      expect(r1.body.email).toBe(u1.email);
      expect(r2.body.email).toBe(u2.email);
    });

    it("should handle user not found scenarios", async () => {
      if (skipIfNoDb()) return;
      const loginResponse = await request(app).post("/api/auth/login").send({
        email: "inttest-auth-none@example.com",
        password: "Password123",
      });
      expect(loginResponse.status).toBe(401);
      const userResponse = await request(app).get("/api/auth/user");
      expect(userResponse.status).toBe(401);
    });

    it("should handle duplicate email registration", async () => {
      if (skipIfNoDb()) return;
      const suffix = Date.now();
      const userData = {
        email: `inttest-auth-dup-${suffix}@example.com`,
        password: "Password123",
        firstName: "Dup",
        lastName: "Test",
      };

      expect((await request(app).post("/api/auth/register").send(userData)).status).toBe(200);
      const second = await request(app).post("/api/auth/register").send(userData);
      expect(second.status).toBe(400);
      expect(String(second.body.message)).toMatch(/already exists|already registered/i);
    });

    it("should validate input fields properly", async () => {
      if (skipIfNoDb()) return;
      const missing = await request(app).post("/api/auth/register").send({
        email: "inttest-auth-miss@example.com",
      });
      expect(missing.status).toBe(400);

      const badEmail = await request(app).post("/api/auth/register").send({
        email: "invalid-email",
        password: "Password123",
        firstName: "Test",
        lastName: "User",
      });
      expect(badEmail.status).toBe(400);

      const weak = await request(app).post("/api/auth/register").send({
        email: "inttest-auth-weak@example.com",
        password: "123",
        firstName: "Test",
        lastName: "User",
      });
      expect(weak.status).toBe(400);
    });

    it("should return user via Bearer JWT (cookie-less API)", async () => {
      if (skipIfNoDb()) return;
      const suffix = Date.now();
      const email = `inttest-auth-jwt-${suffix}@example.com`;
      const id = randomUUID();
      await seedInttestUser({ id, email, password: "Password123" });
      const token = signTestJwt({ id, email });
      const res = await request(app).get("/api/auth/user").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.email).toBe(email);
    });
  });
});
