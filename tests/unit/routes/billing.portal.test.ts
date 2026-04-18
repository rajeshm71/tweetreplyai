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
  storage: { getUser: vi.fn() },
}));
vi.mock("../../../server/services/dodo-payments", () => ({
  PLANS: {},
  dodoPaymentsService: { createCustomerPortalSession: vi.fn() },
}));

describe("Billing Portal Route - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("returns 400 when no billing account exists", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", dodoCustomerId: null } as any);
    const res = await app.raw()
      .post("/api/billing/portal")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(400);
  });

  it("returns 200 with portal URL when user has valid dodoCustomerId", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", dodoCustomerId: "cus-123" } as any);
    vi.mocked(dodoPaymentsService.createCustomerPortalSession).mockResolvedValue({ url: "https://portal.dodo.com" } as any);

    const res = await app.raw()
      .post("/api/billing/portal")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    // Route wraps session.url in portal_url key: res.json({ portal_url: session.url })
    expect(res.body).toHaveProperty("portal_url", "https://portal.dodo.com");
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
    const { createTestApp: createTestAppHelper } = await import("../../helpers/request");
    const res = await createTestAppHelper(unauthApp).raw().post("/api/billing/portal");
    expect(res.status).toBe(401);
  });

  it("returns 500 when portal session service throws", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", dodoCustomerId: "cus-123" } as any);
    vi.mocked(dodoPaymentsService.createCustomerPortalSession).mockRejectedValue(new Error("Service down"));

    const res = await app.raw()
      .post("/api/billing/portal")
      .set("Authorization", `Bearer ${authToken}`);
    expect(res.status).toBe(500);
  });

  it("returns 501 portal_unavailable when Dodo portal is not yet implemented (null session)", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", dodoCustomerId: "cus-123" } as any);
    vi.mocked(dodoPaymentsService.createCustomerPortalSession).mockResolvedValue(null as any);

    const res = await app.raw()
      .post("/api/billing/portal")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(501);
    expect(res.body).toMatchObject({
      code: "portal_unavailable",
      supportEmail: expect.stringContaining("@"),
    });
  });
});

