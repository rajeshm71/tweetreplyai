import { test, expect } from "@playwright/test";

test.describe("Public routing", () => {
  test("pricing redirects unauthenticated users to login with returnUrl", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForURL(/\/login/, { timeout: 30_000 });
    const url = page.url();
    expect(url).toMatch(/login/);
    expect(url).toContain("returnUrl=");
    expect(decodeURIComponent(url)).toContain("/app/pricing");
  });

  test("unknown path shows 404", async ({ page }) => {
    await page.goto("/__e2e_not_found__");
    await expect(page.getByRole("heading", { name: /404 Page Not Found/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
