import { test, expect } from "@playwright/test";
import { getE2eUserEmail, hasE2eUserCreds } from "../fixtures/auth";

test.describe("App shell (authenticated)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD (user with xUsername seeded in DB)",
    );
  });

  test("home shows banner and nav home", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("button-nav-home")).toBeVisible();
  });

  test("user menu shows email", async ({ page }) => {
    await page.goto("/app");
    await page.getByTestId("button-user-menu").click();
    const email = getE2eUserEmail();
    await expect(page.getByTestId("text-user-email")).toContainText(email);
  });

  test("navigate to pricing via header", async ({ page }) => {
    await page.goto("/app");
    await page.getByTestId("button-nav-pricing").click();
    await expect(page).toHaveURL(/\/app\/pricing/, { timeout: 15_000 });
    await expect(page.getByRole("banner")).toBeVisible();
  });
});
