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
    getReplyHistory: vi.fn(),
    markReplyAsUsed: vi.fn(),
  },
}));

describe("Reply History Routes - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("gets reply history for authenticated user", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockResolvedValue([]);
    const res = await app.raw()
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ history: [] });
  });

  it("returns history entries with expected shape", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockResolvedValue([
      {
        id: "hist-1",
        userId: "test-user",
        originalTweet: "Some tweet",
        generatedReply: "My reply",
        wasUsed: false,
        qualityScore: 72,
        modelKey: "gpt-4o-mini",
        createdAt: new Date("2024-01-01"),
      },
    ] as any);

    const res = await app.raw()
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0]).toHaveProperty("id", "hist-1");
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
    const res = await createTestApp(unauthApp).raw().get("/api/reply-history");
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage throws on GET", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .get("/api/reply-history")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(500);
  });

  it("marks reply as used via POST /api/reply-history/:id/mark-used", async () => {
    const { storage } = await import("../../../server/storage");
    // Route validates :id with z.string().uuid() — must use a valid UUID
    const validId = "00000000-0000-0000-0000-000000000001";
    vi.mocked(storage.markReplyAsUsed).mockResolvedValue({ id: validId, wasUsed: true } as any);

    const res = await app.raw()
      .post(`/api/reply-history/${validId}/mark-used`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(storage.markReplyAsUsed).toHaveBeenCalledWith(validId, undefined);
  });
});

