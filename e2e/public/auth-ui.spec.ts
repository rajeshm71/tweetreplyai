import { test, expect } from "@playwright/test";

test.describe("Auth UI (unauthenticated)", () => {
  test("login dialog is visible", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /Welcome to TweetReply/i }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("input-login-email")).toBeVisible();
  });

  test("empty submit shows validation", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("button-login-submit").click();
    await expect(page.getByText("Invalid email address")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Password is required")).toBeVisible();
  });

  test("invalid email shows destructive hint", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("input-login-email").fill("not-an-email");
    await page.getByTestId("input-login-password").fill("Validpass1");
    await page.getByTestId("button-login-submit").click();
    await expect(page.getByText("Invalid email address")).toBeVisible({ timeout: 10_000 });
  });

  test("register mode shows first and last name fields", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /^Register$/ }).click();
    await expect(page.getByTestId("input-register-firstname")).toBeVisible();
    await expect(page.locator("#register-lastName")).toBeVisible();
  });

  test("forgot password panel", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Forgot password/i }).click();
    await expect(page.locator("#forgot-email")).toBeVisible();
    await expect(page.getByRole("button", { name: /Send reset link/i })).toBeVisible();
  });
});
