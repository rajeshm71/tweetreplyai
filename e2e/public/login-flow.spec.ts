import { test, expect } from "@playwright/test";
import {
  getE2eUserEmail,
  getE2eUserPassword,
  hasE2eUserCreds,
  loginViaUi,
} from "../fixtures/auth";

test.describe("Login flow (UI)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(!hasE2eUserCreds(), "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for login E2E");
  });

  test("successful login leaves login page or shows success toast", async ({ page }) => {
    const email = getE2eUserEmail();
    const password = getE2eUserPassword();

    await loginViaUi(page, email, password);

    await Promise.race([
      page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 45_000 }),
      page.getByText("Logged in successfully").waitFor({ state: "visible", timeout: 45_000 }),
    ]);

    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-user-menu")).toBeVisible({ timeout: 30_000 });
  });

  test("wrong password shows login failed", async ({ page }) => {
    const email = getE2eUserEmail();

    await loginViaUi(page, email, "DefinitelyWrongPassword!1");

    await expect(page.getByText("Login failed", { exact: true }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-user-menu")).not.toBeVisible();
  });
});
