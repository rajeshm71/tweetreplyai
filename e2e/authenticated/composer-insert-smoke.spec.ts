import { test, expect } from "@playwright/test";
import { hasE2eUserCreds } from "../fixtures/auth";

/**
 * Optional live X smoke: loads the unpacked extension via Playwright (Chrome
 * channel) and checks that Suggest inserts text without leaving the placeholder
 * ghosting on top of the draft (Draft.js state must update).
 *
 * Runs only in project `chromium-x-extension-composer` when `E2E_X_COMPOSER_E2E=1`.
 * Excluded from `chromium-authenticated` (no extension there). See tests/README.md.
 */
test.describe("X composer insert (extension + live X)", () => {
  test.beforeEach(({}, testInfo) => {
    testInfo.skip(
      !hasE2eUserCreds(),
      "Set E2E_USER_EMAIL and E2E_USER_PASSWORD (TweetReply account; extension may use same backend)",
    );
    testInfo.skip(
      !process.env.E2E_X_REPLY_TWEET_URL?.trim(),
      "Set E2E_X_REPLY_TWEET_URL to a full https://x.com/.../status/... URL (must be logged into X in this Chrome profile).",
    );
  });

  test("Suggest reply clears placeholder and enables Reply", async ({ page }) => {
    test.setTimeout(180_000);
    const tweetUrl = process.env.E2E_X_REPLY_TWEET_URL!.trim();

    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });

    const suggest = page.locator(".tweetreply-suggest-btn").filter({ hasText: /Suggest reply/i });
    await expect(suggest.first()).toBeVisible({ timeout: 90_000 });
    await suggest.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 30_000 });

    const textbox = dialog.locator('div[data-testid^="tweetTextarea_"][role="textbox"]').first();
    await expect(textbox).toBeVisible({ timeout: 30_000 });

    await expect(textbox).toContainText(/\S/, { timeout: 120_000 });

    const placeholder = dialog.locator('[data-testid$="Placeholder"]');
    const n = await placeholder.count();
    if (n > 0) {
      await expect(placeholder.first()).toBeHidden({ timeout: 15_000 });
    }

    const replyBtn = dialog.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]');
    await expect(replyBtn.first()).toBeEnabled({ timeout: 30_000 });
  });
});
