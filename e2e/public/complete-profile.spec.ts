import { test, expect } from "@playwright/test";
import {
  getE2eNoXEmail,
  getE2eNoXPwd,
  hasE2eNoXUserCreds,
  loginViaUi,
} from "../fixtures/auth";

/**
 * Requires a dedicated user with no `xUsername` in DB. Completing the flow mutates the user;
 * re-run needs a reset handle or a fresh user.
 */
test.describe("Complete profile gate (optional user)", () => {
  test.describe.configure({ timeout: 90_000 });

  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eNoXUserCreds(),
      "Set E2E_USER_NO_X_EMAIL and E2E_USER_NO_X_PASSWORD (user without xUsername in DB)",
    );
  });

  test("complete profile heading after login", async ({ page }, testInfo) => {
    await loginViaUi(page, getE2eNoXEmail(), getE2eNoXPwd());

    const heading = page.getByRole("heading", { name: /Complete your profile/i });
    const userMenu = page.getByTestId("button-user-menu");
    await Promise.race([
      heading.waitFor({ state: "visible", timeout: 45_000 }),
      userMenu.waitFor({ state: "visible", timeout: 45_000 }),
    ]);
    if (await userMenu.isVisible().catch(() => false)) {
      testInfo.skip(
        true,
        "NO_X user landed on app shell (already has xUsername in DB — use a user without handle or clear handle)",
      );
    }

    await expect(heading).toBeVisible({ timeout: 5_000 });
  });

  test("submit x username navigates to app shell", async ({ page }, testInfo) => {
    await loginViaUi(page, getE2eNoXEmail(), getE2eNoXPwd());

    const heading = page.getByRole("heading", { name: /Complete your profile/i });
    const userMenu = page.getByTestId("button-user-menu");
    await Promise.race([
      heading.waitFor({ state: "visible", timeout: 45_000 }),
      userMenu.waitFor({ state: "visible", timeout: 45_000 }),
    ]);
    if (await userMenu.isVisible().catch(() => false)) {
      testInfo.skip(
        true,
        "NO_X user landed on app shell (already has xUsername in DB — use a user without handle or clear handle)",
      );
    }

    await expect(heading).toBeVisible({ timeout: 5_000 });

    await page.locator("#x-username").fill(`e2e_test_handle_${Date.now()}`);
    await page.getByRole("button", { name: /Continue/i }).click();

    await page.goto("/app", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("button-user-menu")).toBeVisible({ timeout: 30_000 });
  });
});
