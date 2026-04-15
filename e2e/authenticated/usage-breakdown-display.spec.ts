import { expect, test } from "@playwright/test";
import { hasE2eUserCreds } from "../fixtures/auth";

test.describe("Usage breakdown display (authenticated)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD for authenticated usage breakdown checks",
    );
  });

  test("shows replies + credits rows and total in usage card", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 });

    const breakdownButton = page.getByRole("button", { name: "Credit Breakdown" }).first();
    await expect(breakdownButton).toBeVisible();
    await breakdownButton.click();

    const totalLine = page.getByText(/Total:\s*\d+\s+replies,\s*\d+\s+credits/i).first();
    await expect(totalLine).toBeVisible();

    // If a mode row exists, ensure it uses "X replies, Y credits" format.
    const conciseRow = page.getByText(/^Concise:/).first();
    if (await conciseRow.isVisible().catch(() => false)) {
      await expect(page.getByText(/Concise:\s*\d+\s+replies,\s*\d+\s+credits/i).first()).toBeVisible();
    }
  });

  test("uses numeric fallback instead of placeholder when no reply count is available", async ({ page }) => {
    await page.goto("/app");
    await expect(page.getByRole("banner")).toBeVisible({ timeout: 30_000 });

    const breakdownButton = page.getByRole("button", { name: "Credit Breakdown" }).first();
    await expect(breakdownButton).toBeVisible();
    await breakdownButton.click();

    // Fix: assert placeholder never appears, regardless of whether totals are zero or non-zero.
    await expect(page.getByText("--")).toHaveCount(0);
    await expect(page.getByText(/Total:\s*\d+\s+replies,\s*\d+\s+credits/i).first()).toBeVisible();
  });
});
