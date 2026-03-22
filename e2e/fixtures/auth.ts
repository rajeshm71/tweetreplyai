import type { Page } from "@playwright/test";

const trim = (v: string | undefined) => v?.trim() ?? "";

/** Seeded user with `xUsername` — used by global-setup + authenticated project skips. */
export function hasE2eUserCreds(): boolean {
  return !!(trim(process.env.E2E_USER_EMAIL) && trim(process.env.E2E_USER_PASSWORD));
}

export function getE2eUserEmail(): string {
  return trim(process.env.E2E_USER_EMAIL);
}

export function getE2eUserPassword(): string {
  return trim(process.env.E2E_USER_PASSWORD);
}

/** Optional user without handle for complete-profile flow (mutates DB on success). */
export function hasE2eNoXUserCreds(): boolean {
  return !!(
    trim(process.env.E2E_USER_NO_X_EMAIL) && trim(process.env.E2E_USER_NO_X_PASSWORD)
  );
}

export function getE2eNoXEmail(): string {
  return trim(process.env.E2E_USER_NO_X_EMAIL);
}

export function getE2eNoXPwd(): string {
  return trim(process.env.E2E_USER_NO_X_PASSWORD);
}

/**
 * UI login: navigate to `/login`, fill credentials, submit.
 * Caller should `waitForURL` / toast / assertions after this returns.
 */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("input-login-email").fill(email);
  await page.getByTestId("input-login-password").fill(password);
  await page.getByTestId("button-login-submit").click();
}
