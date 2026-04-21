import { test, expect } from "@playwright/test";
import { hasE2eUserCreds } from "../fixtures/auth";

test.describe("Settings route smoke (authenticated)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD (user with xUsername seeded in DB)",
    );
  });

  test("settings page renders and does not show global error boundary", async ({ page }) => {
    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /^Settings$/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Something went wrong")).toHaveCount(0);
    await expect(page.getByTestId("card-notifications")).toBeVisible();
    await expect(page.getByTestId("card-reply-generation")).toBeVisible();
  });
});
