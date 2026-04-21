import { defineConfig } from "vitest/config";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./client/src"),
      "@shared": resolve(__dirname, "./shared"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup-client.ts", "./tests/env-setup.ts"],
    include: ["tests/unit/client/**/*.test.ts", "tests/unit/client/**/*.test.tsx"],
    exclude: ["tests/integration/**", "e2e/**"],
    testTimeout: 15000,
  },
});
