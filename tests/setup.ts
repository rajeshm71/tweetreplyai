import "./env-setup";
import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./mocks/handlers";

// Setup MSW server for API mocking
const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Re-export test helpers (import paths are stable for consumers).
export * from "./helpers/auth";
export * from "./helpers/request";
