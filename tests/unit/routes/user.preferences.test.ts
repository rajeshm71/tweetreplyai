import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import { createTestApp } from "../../helpers/request";
import { signTestJwt } from "../../helpers/jwt";

vi.mock("../../../server/replitAuth", () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "test-user" };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn(() => "test-user"),
}));
vi.mock("../../../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));
vi.mock("../../../server/storage", () => ({
  storage: {
    getUserPreferences: vi.fn(),
    upsertUserPreferences: vi.fn(),
  },
}));

describe("User Preferences Routes - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("returns user preferences", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUserPreferences).mockResolvedValue({ preferredPrompt: "default" } as any);
    const res = await app.raw()
      .get("/api/user/preferences")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ preferredPrompt: "default" });
  });

  it("creates and returns default preferences when none exist yet", async () => {
    const { storage } = await import("../../../server/storage");
    // Route: when getUserPreferences returns null, it calls upsertUserPreferences to create defaults
    const defaultPrefs = { id: "pref-default", userId: "test-user", tone: "default", length: "default", style: "default", topics: [], promptStyleEnabled: false };
    vi.mocked(storage.getUserPreferences).mockResolvedValue(null);
    vi.mocked(storage.upsertUserPreferences).mockResolvedValue(defaultPrefs as any);

    const res = await app.raw()
      .get("/api/user/preferences")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("tone", "default");
    expect(storage.upsertUserPreferences).toHaveBeenCalled();
  });

  it("updates preferences via PUT with valid body", async () => {
    const { storage } = await import("../../../server/storage");
    const updated = { id: "pref-1", userId: "test-user", preferredPrompt: "humorous", preferredModel: "gpt-4o-mini", tonePreference: "casual", maxReplyLength: 200, autoRegenerate: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    vi.mocked(storage.upsertUserPreferences).mockResolvedValue(updated as any);

    const res = await app.raw()
      .put("/api/user/preferences")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ preferredPrompt: "humorous" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("preferredPrompt", "humorous");
  });

  it("returns 401 when not authenticated", async () => {
    const unauthApp = express();
    unauthApp.use(express.json());
    unauthApp.use((req: any, _res: any, next: any) => {
      req.user = null;
      req.isAuthenticated = () => false;
      req.logout = vi.fn((cb: any) => cb());
      next();
    });
    await setupRoutes(unauthApp);
    const { createTestApp } = await import("../../helpers/request");
    const res = await createTestApp(unauthApp).raw().get("/api/user/preferences");
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage throws on GET", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUserPreferences).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .get("/api/user/preferences")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(500);
  });
});

