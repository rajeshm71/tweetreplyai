import { test, expect } from "@playwright/test";
import { hasE2eUserCreds } from "../fixtures/auth";

test.describe("Profile and settings (authenticated)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD (user with xUsername seeded in DB)",
    );
  });

  test("profile page heading", async ({ page }) => {
    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Profile$/ })).toBeVisible({
      timeout: 30_000,
    });
  });

  test("settings page shows sections", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("card-notifications")).toBeVisible();
    await expect(page.getByTestId("card-reply-generation")).toBeVisible();
  });

  test("logout returns to public experience without user menu", async ({ page }) => {
    await page.goto("/app");
    await page.getByTestId("button-user-menu").click();
    await page.getByTestId("menu-item-logout").click();
    await page.waitForURL(/\//, { timeout: 30_000 });
    await expect(page.getByTestId("button-user-menu")).not.toBeVisible();
  });
});
