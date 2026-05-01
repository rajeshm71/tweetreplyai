import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

/** Dev server binds `localhost` in development — match for webServer readiness. */
const defaultBaseURL = "http://localhost:5000";
const baseURL = process.env.E2E_BASE_URL || defaultBaseURL;

const extensionDir = path.resolve(process.cwd(), "extension");

const xExtensionComposerProject =
  process.env.E2E_X_COMPOSER_E2E === "1"
    ? {
        name: "chromium-x-extension-composer",
        testMatch: "**/authenticated/composer-insert-smoke.spec.ts",
        use: {
          ...devices["Desktop Chrome"],
          channel: "chrome",
          headless: false,
          launchOptions: {
            args: [
              `--disable-extensions-except=${extensionDir}`,
              `--load-extension=${extensionDir}`,
            ],
          },
        },
      }
    : null;

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-public-api",
      testIgnore: ["**/authenticated/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-authenticated",
      testMatch: "**/authenticated/**/*.spec.ts",
      testIgnore: "**/authenticated/composer-insert-smoke.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
    ...(xExtensionComposerProject ? [xExtensionComposerProject] : []),
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: defaultBaseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          SKIP_AUTH_RATE_LIMIT: "1",
        },
      },
});
