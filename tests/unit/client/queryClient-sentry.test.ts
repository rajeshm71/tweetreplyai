import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
const withScope = vi.fn((fn: (scope: { setTag: typeof vi.fn }) => void) => {
  fn({ setTag: vi.fn() });
});

// `client/src/lib/sentry.ts` uses `import * as Sentry from "@sentry/react"`,
// so named exports must be top-level (not nested under `Sentry`).
vi.mock("@sentry/react", () => ({
  __esModule: true,
  init: vi.fn(),
  setUser: vi.fn(),
  withScope,
  captureException,
}));

describe("queryClient Sentry onError", () => {
  beforeEach(() => {
    captureException.mockClear();
    withScope.mockClear();
  });

  it("does not capture when VITE_SENTRY_DSN is unset", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "");
    const { queryClient } = await import("../../../client/src/lib/queryClient");
    const onError = queryClient.getDefaultOptions().queries?.onError;
    expect(typeof onError).toBe("function");
    const err = Object.assign(new Error("502: bad"), { status: 502 });
    (onError as (e: Error, q: { queryKey: string[] }) => void)(err, { queryKey: ["/api/foo"] } as any);
    expect(withScope).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("captures 5xx query errors when DSN is set", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@test.ingest.sentry.io/1");
    const { queryClient } = await import("../../../client/src/lib/queryClient");
    const onError = queryClient.getDefaultOptions().queries?.onError as (
      e: Error,
      q: { queryKey: string[] },
    ) => void;
    const err = Object.assign(new Error("500: boom"), { status: 500 });
    onError(err, { queryKey: ["/api/auth/user"] } as any);
    expect(withScope).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("skips 401 for queries when DSN is set", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@test.ingest.sentry.io/1");
    const { queryClient } = await import("../../../client/src/lib/queryClient");
    const onError = queryClient.getDefaultOptions().queries?.onError as (
      e: Error,
      q: { queryKey: string[] },
    ) => void;
    const err = Object.assign(new Error("401"), { status: 401 });
    onError(err, { queryKey: ["/api/foo"] } as any);
    expect(withScope).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("captures 5xx mutation errors when DSN is set", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@test.ingest.sentry.io/1");
    const { queryClient } = await import("../../../client/src/lib/queryClient");
    const onError = queryClient.getDefaultOptions().mutations?.onError as (
      e: Error,
      v: unknown,
      c: unknown,
      m: { options: { mutationKey?: readonly string[] } },
    ) => void;
    const err = Object.assign(new Error("503"), { status: 503 });
    onError(err, undefined, undefined, {
      options: { mutationKey: ["/api/billing/portal"] },
    } as any);
    expect(withScope).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
