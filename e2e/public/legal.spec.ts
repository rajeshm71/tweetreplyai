import { test, expect } from "@playwright/test";

test.describe("Legal pages", () => {
  test("privacy policy loads", async ({ page }) => {
    await page.goto("/privacy");
    // CardTitle renders as a div (not role=heading); assert visible title text.
    await expect(page.getByText("Privacy Policy", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("terms of service load", async ({ page }) => {
    await page.goto("/terms");
    await expect(page.getByText("Terms of Service", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  });
});
