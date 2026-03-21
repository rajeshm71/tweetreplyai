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
    updateUser: vi.fn(),
  },
}));

describe("User X Username Route - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("updates username when payload is valid", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.updateUser).mockResolvedValue({ id: "test-user", xUsername: "alice" } as any);
    const res = await app.raw()
      .post("/api/user/x-username")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ xUsername: "alice" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, xUsername: "alice" });
  });

  it("strips @ prefix from username (route normalizes it)", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.updateUser).mockResolvedValue({ id: "test-user", xUsername: "alice" } as any);

    const res = await app.raw()
      .post("/api/user/x-username")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ xUsername: "@alice" });

    expect(res.status).toBe(200);
    expect(res.body.xUsername).toBe("alice");
  });

  it("returns 400 when xUsername is empty string", async () => {
    const res = await app.raw()
      .post("/api/user/x-username")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ xUsername: "" });

    expect(res.status).toBe(400);
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
    const res = await createTestApp(unauthApp).raw()
      .post("/api/user/x-username")
      .send({ xUsername: "alice" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when storage throws", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.updateUser).mockRejectedValue(new Error("DB error"));

    const res = await app.raw()
      .post("/api/user/x-username")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ xUsername: "alice" });
    expect(res.status).toBe(500);
  });
});

