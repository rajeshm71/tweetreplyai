/**
 * Writes e2e/.auth/user.json for the authenticated Playwright project.
 * With E2E_USER_EMAIL + E2E_USER_PASSWORD: UI login once, save storage state.
 * Without: writes empty cookies so storageState path exists.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const authStoragePath = join(__dirname, ".auth", "user.json");

export default async function globalSetup(config: FullConfig) {
  await mkdir(dirname(authStoragePath), { recursive: true });

  const baseURL =
    (typeof config.use?.baseURL === "string" ? config.use.baseURL : null) ||
    process.env.E2E_BASE_URL ||
    "http://localhost:5000";

  const email = process.env.E2E_USER_EMAIL?.trim();
  const password = process.env.E2E_USER_PASSWORD?.trim();

  if (!email || !password) {
    await writeFile(authStoragePath, JSON.stringify({ cookies: [], origins: [] }, null, 2));
    return;
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await page.getByTestId("input-login-email").fill(email);
    await page.getByTestId("input-login-password").fill(password);
    await page.getByTestId("button-login-submit").click();
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 45_000 });
    if (page.url().includes("complete-profile")) {
      throw new Error(
        "E2E user must have xUsername set in the database; complete-profile gate is still active.",
      );
    }
    await page.context().storageState({ path: authStoragePath });
  } finally {
    await browser.close();
  }
}
