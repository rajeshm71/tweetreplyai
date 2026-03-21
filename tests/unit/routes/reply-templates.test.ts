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
  },
}));

describe("Reply Templates Route - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("returns templates list", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockResolvedValue([
      {
        id: "tmpl-1",
        wasUsed: true,
        qualityScore: 80,
        generatedReply: "Reply template",
        originalTweet: "Original tweet",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ] as any);

    const res = await app.raw()
      .get("/api/reply-templates")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      templates: [
        {
          id: "tmpl-1",
          template: "Reply template",
          originalTweet: "Original tweet",
          qualityScore: 80,
          createdAt: "2024-01-01T00:00:00.000Z",
        },
      ],
    });
  });

  it("returns empty templates list when no history", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockResolvedValue([]);

    const res = await app.raw()
      .get("/api/reply-templates")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ templates: [] });
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
    const res = await createTestApp(unauthApp).raw().get("/api/reply-templates");
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage throws", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getReplyHistory).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .get("/api/reply-templates")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(500);
  });
});

