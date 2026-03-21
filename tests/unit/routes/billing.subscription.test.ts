import { beforeEach, describe, it, vi } from "vitest";
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
    getActiveSubscription: vi.fn(),
    getUsageCounter: vi.fn(),
    getUser: vi.fn(),
    updateSubscription: vi.fn(),
    updateUser: vi.fn(),
  },
}));
vi.mock("../../../server/services/dodo-payments", () => ({
  PLANS: {},
  dodoPaymentsService: { cancelSubscription: vi.fn() },
}));
vi.mock("../../../server/services/usage", () => ({
  usageService: { getUsageStatus: vi.fn() },
}));

describe("Subscription Routes - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("responds on subscription status endpoint", async () => {
    const res = await app.raw()
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hasSubscription: false,
      planCode: null,
      status: null,
    });
  });

  it("returns active subscription details on /api/subscription/status", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getActiveSubscription).mockResolvedValue({
      id: "sub-1",
      userId: "test-user",
      planCode: "weekly",
      status: "active",
      dodoSubscriptionId: "dodo-sub-1",
      currentPeriodStart: new Date("2024-01-01"),
      currentPeriodEnd: new Date("2024-01-08"),
      cancelAt: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    } as any);

    const res = await app.raw()
      .get("/api/subscription/status")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hasSubscription: true,
      planCode: "weekly",
      status: "active",
    });
  });

  it("cancels subscription via POST /api/subscription/cancel", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");

    const activeSub = {
      id: "sub-1",
      userId: "test-user",
      planCode: "weekly",
      status: "active",
      dodoSubscriptionId: "dodo-sub-1",
      currentPeriodStart: new Date("2024-01-01"),
      currentPeriodEnd: new Date("2024-01-08"),
      cancelAt: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
    };
    vi.mocked(storage.getActiveSubscription)
      .mockResolvedValueOnce(activeSub as any)
      .mockResolvedValueOnce({ ...activeSub, status: "canceled" } as any);
    vi.mocked(dodoPaymentsService.cancelSubscription).mockResolvedValue(undefined as any);
    vi.mocked(storage.updateSubscription).mockResolvedValue({ ...activeSub, status: "canceled" } as any);

    const res = await app.raw()
      .post("/api/subscription/cancel")
      .set("Authorization", `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("message", "Subscription canceled successfully");
  });

  it("returns 401 when not authenticated on /api/subscription/status", async () => {
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
    const res = await createTestAppHelper(unauthApp).raw().get("/api/subscription/status");
    expect(res.status).toBe(401);
  });
});

