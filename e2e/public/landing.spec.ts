import { test, expect } from "@playwright/test";

test.describe("Landing", () => {
  test("shows hero heading and main landmark", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#hero-heading")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("main#main-content")).toBeVisible();
  });

  test("shows main navigation", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("navigation", { name: /Main navigation/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
