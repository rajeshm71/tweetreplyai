import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('reportRouteError', () => {
  const captureException = vi.fn();
  const withScope = vi.fn((fn: (scope: { setTag: typeof vi.fn }) => void) => {
    fn({ setTag: vi.fn() });
  });

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('SENTRY_DSN', 'https://public@test.ingest.sentry.io/1');
    vi.doMock('@sentry/node', () => ({
      init: vi.fn(),
      withScope,
      captureException,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('@sentry/node');
    vi.resetModules();
  });

  it('skips Zod validation errors', async () => {
    const { ZodError } = await import('zod');
    const { initSentry, reportRouteError } = await import('../../../server/utils/sentry.js');
    initSentry();
    captureException.mockClear();
    withScope.mockClear();
    reportRouteError(new ZodError([]), { route: 'POST /test', httpStatus: 500 });
    expect(withScope).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it('captures server errors with route tag', async () => {
    const { initSentry, reportRouteError } = await import('../../../server/utils/sentry.js');
    initSentry();
    captureException.mockClear();
    withScope.mockClear();
    reportRouteError(new Error('boom'), { route: 'POST /api/reframe-tweet', userId: 'u1', httpStatus: 500 });
    expect(withScope).toHaveBeenCalled();
    expect(captureException).toHaveBeenCalledWith(expect.any(Error));
  });
});
