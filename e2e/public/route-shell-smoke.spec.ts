import { test, expect } from "@playwright/test";

test.describe("Public route shell smoke", () => {
  test.setTimeout(90_000);

  test("privacy and terms pages render stable shells", async ({ page }) => {
    await page.goto("/privacy", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(
      page.locator("div.tracking-tight").filter({ hasText: /^Privacy Policy$/ }),
    ).toBeVisible({
      timeout: 30_000,
    });

    await page.goto("/terms", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(
      page.locator("div.tracking-tight").filter({ hasText: /^Terms of Service$/ }),
    ).toBeVisible({
      timeout: 30_000,
    });
  });
});
