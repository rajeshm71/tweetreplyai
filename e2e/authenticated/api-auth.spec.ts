import { test, expect } from "@playwright/test";
import { getE2eUserEmail, hasE2eUserCreds } from "../fixtures/auth";

test.describe("API with session", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for authenticated API E2E",
    );
  });

  test("GET /api/auth/user returns seeded email", async ({ request }) => {
    const res = await request.get("/api/auth/user");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(getE2eUserEmail());
  });
});
