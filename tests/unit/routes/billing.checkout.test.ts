import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { setupRoutes } from "../../../server/routes";
import { createTestApp, expectJsonResponse } from "../../helpers/request";
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
  PLANS: { weekly: { code: "weekly", name: "Weekly", price: 399, credits: 10, interval: "week" } },
  dodoPaymentsService: { createCheckoutSession: vi.fn() },
}));

describe("Billing Checkout Route - Unit Tests", () => {
  let app: any;
  const authToken = signTestJwt({ id: "test-user", email: "test@example.com" });
  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  it("creates checkout URL for valid plan", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", email: "test@example.com" } as any);
    vi.mocked(dodoPaymentsService.createCheckoutSession).mockResolvedValue({ url: "https://checkout" } as any);
    const res = await app.raw()
      .post("/api/checkout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ plan_code: "weekly" });
    expectJsonResponse(res, 200, { checkout_url: "https://checkout" });
  });

  it("returns 400 for unknown plan_code", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", email: "test@example.com" } as any);

    const res = await app.raw()
      .post("/api/checkout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ plan_code: "nonexistent_plan" });

    expect(res.status).toBe(400);
  });

  it("returns 400 when plan_code is missing", async () => {
    const { storage } = await import("../../../server/storage");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", email: "test@example.com" } as any);

    const res = await app.raw()
      .post("/api/checkout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

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
    const { createTestApp: createTestAppHelper } = await import("../../helpers/request");
    const res = await createTestAppHelper(unauthApp).raw()
      .post("/api/checkout")
      .send({ plan_code: "weekly" });
    expect(res.status).toBe(401);
  });

  it("returns 500 when checkout service throws", async () => {
    const { storage } = await import("../../../server/storage");
    const { dodoPaymentsService } = await import("../../../server/services/dodo-payments");
    vi.mocked(storage.getUser).mockResolvedValue({ id: "test-user", email: "test@example.com" } as any);
    vi.mocked(dodoPaymentsService.createCheckoutSession).mockRejectedValue(new Error("Payment provider down"));

    const res = await app.raw()
      .post("/api/checkout")
      .set("Authorization", `Bearer ${authToken}`)
      .send({ plan_code: "weekly" });

    expect(res.status).toBe(500);
  });
});

