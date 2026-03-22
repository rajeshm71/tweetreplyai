import { defineConfig, configDefaults } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './client/src'),
      '@shared': resolve(__dirname, './shared'),
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'tests/integration/**',
    ],
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        'client/',
        // Raw Supabase DB layer — requires a live database; not unit-testable
        '**/storage-supabase.ts',
        // Browser extension code — runs in Chrome, not Node; excluded from unit coverage
        'extension/**',
      ],
      thresholds: {
        // Global aggregate thresholds only. Files in coverage.exclude do not count.
        // Raise deliberately as the suite grows (see tests/README.md).
        lines: 60,
        functions: 60,
        branches: 40,
        statements: 60,
        perFile: false,
      },
    },
    testTimeout: 10000,
  },
});
