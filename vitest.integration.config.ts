import { defineConfig } from "vitest/config";
import { resolve } from "path";

/**
 * Integration-only Vitest config (do not merge with vitest.config.ts — avoids running
 * `tests/setup.ts` MSW twice and keeps `onUnhandledRequest: bypass` for real supertest traffic).
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "./client/src"),
      "@shared": resolve(__dirname, "./shared"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/integration/setup.ts"],
    testTimeout: 10000,
    fileParallelism: false,
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    retry: 0,
    env: {
      SKIP_AUTH_RATE_LIMIT: "1",
    },
  },
});
