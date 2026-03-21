import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import { createTestApp } from "../../helpers/request";
import { signTestJwt } from "../../helpers/jwt";

vi.mock("../../../server/localAuth", () => ({ setupLocalAuth: vi.fn() }));
vi.mock("../../../server/storage", () => ({
  storage: { getUser: vi.fn() },
}));

// Mock jsonwebtoken — verify is used to decode the cookie JWT, sign mints the extension token
vi.mock("jsonwebtoken", () => ({
  default: {
    verify: vi.fn(),
    sign: vi.fn().mockReturnValue("mock-extension-jwt"),
  },
}));

// replitAuth.isAuthenticated is NOT used by this route — the route handles auth itself.
// We still need setupAuth + getUserId mocked to allow setupRoutes to complete.
vi.mock("../../../server/replitAuth", () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, _res: any, next: any) => {
    req.isAuthenticated = () => !!req.user;
    next();
  }),
  getUserId: vi.fn((req: any) => req.user?.id ?? null),
}));

const mockUser = {
  id: "ext-user-1",
  email: "ext@example.com",
  authProviders: ["password"],
};

describe("Extension Auth Route - Unit Tests", () => {
  let baseApp: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    baseApp = express();
    baseApp.use(express.json());
    // cookie-parser is needed for req.cookies to work
    const cookieParser = (await import("cookie-parser")).default;
    baseApp.use(cookieParser());
    await setupRoutes(baseApp);
  });

  it("returns 200 with token when authenticated via Passport session (req.user set)", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

    // Inject req.user via middleware to simulate an active Passport session
    const sessionApp = express();
    sessionApp.use(express.json());
    const cookieParser = (await import("cookie-parser")).default;
    sessionApp.use(cookieParser());
    sessionApp.use((req: any, _res: any, next: any) => {
      req.user = { id: mockUser.id };
      next();
    });
    await setupRoutes(sessionApp);

    const res = await createTestApp(sessionApp).raw().get("/api/extension/auth");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("authenticated", true);
    expect(res.body).toHaveProperty("token", "mock-extension-jwt");
    expect(res.body.user).toMatchObject({ id: mockUser.id, email: mockUser.email });
  });

  it("returns 200 with token when authenticated via JWT cookie", async () => {
    const { storage } = await import("../../../server/storage");
    const jwt = await import("jsonwebtoken");
    vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);
    vi.mocked(jwt.default.verify).mockReturnValue({ id: mockUser.id } as any);

    // Build app with cookie-parser but no req.user (simulates unauthenticated session)
    const cookieApp = express();
    cookieApp.use(express.json());
    const cookieParser = (await import("cookie-parser")).default;
    cookieApp.use(cookieParser());
    await setupRoutes(cookieApp);

    const res = await createTestApp(cookieApp)
      .raw()
      .get("/api/extension/auth")
      .set("Cookie", "token=valid-jwt-here");

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("authenticated", true);
    expect(res.body).toHaveProperty("token", "mock-extension-jwt");
  });

  it("returns 401 when no session and no cookie", async () => {
    const res = await createTestApp(baseApp).raw().get("/api/extension/auth");
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("authenticated", false);
  });

  it("returns 401 when cookie JWT is expired or invalid", async () => {
    const jwt = await import("jsonwebtoken");
    vi.mocked(jwt.default.verify).mockImplementation(() => {
      throw new Error("jwt expired");
    });

    const res = await createTestApp(baseApp)
      .raw()
      .get("/api/extension/auth")
      .set("Cookie", "token=expired-jwt");

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("authenticated", false);
  });

  it("returns 500 when storage.getUser throws", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockRejectedValue(new Error("DB unavailable"));

    const errorApp = express();
    errorApp.use(express.json());
    const cookieParser = (await import("cookie-parser")).default;
    errorApp.use(cookieParser());
    errorApp.use((req: any, _res: any, next: any) => {
      req.user = { id: "ext-user-1" };
      next();
    });
    await setupRoutes(errorApp);

    const res = await createTestApp(errorApp).raw().get("/api/extension/auth");
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("message", "Failed to get auth status");
  });
});
