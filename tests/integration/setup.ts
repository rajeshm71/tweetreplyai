/**
 * Vitest setup for integration tests only (merged via vitest.integration.config.ts).
 * MSW uses `bypass` so real supertest HTTP traffic to the local app is not treated as unhandled.
 */
import "../env-setup";
import { beforeAll, afterAll, afterEach, vi } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "../mocks/handlers";

const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

export * from "../helpers/auth";
export * from "../helpers/request";
