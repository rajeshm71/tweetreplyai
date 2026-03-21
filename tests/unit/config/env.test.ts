import { describe, expect, it, vi, afterEach } from 'vitest';

const savedNodeEnv = process.env.NODE_ENV;
const savedSessionSecret = process.env.SESSION_SECRET;
const savedVercel = process.env.VERCEL;

describe('Env Config - Unit Tests', () => {
  afterEach(() => {
    process.env.NODE_ENV = savedNodeEnv;
    if (savedSessionSecret !== undefined) {
      process.env.SESSION_SECRET = savedSessionSecret;
    } else {
      delete process.env.SESSION_SECRET;
    }
    if (savedVercel !== undefined) {
      process.env.VERCEL = savedVercel;
    } else {
      delete process.env.VERCEL;
    }
  });

  describe('getClientErrorBody', () => {
    it('includes error field in non-production mode', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.VERCEL;
      vi.resetModules();
      const { getClientErrorBody } = await import('../../../server/config/env');

      const result = getClientErrorBody(new Error('DB failure'), 'Something went wrong');
      expect(result.message).toBe('Something went wrong');
      expect(result.error).toBe('DB failure');
    });

    it('omits error field in production mode (security)', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { getClientErrorBody } = await import('../../../server/config/env');

      const result = getClientErrorBody(new Error('DB failure'), 'Something went wrong');
      expect(result.message).toBe('Something went wrong');
      expect(result).not.toHaveProperty('error');
    });

    it('handles non-Error objects as error detail', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.VERCEL;
      vi.resetModules();
      const { getClientErrorBody } = await import('../../../server/config/env');

      const result = getClientErrorBody('plain string error', 'Oops');
      expect(result.error).toBe('plain string error');
    });
  });

  describe('getSessionSecret', () => {
    it('returns configured SESSION_SECRET in development', async () => {
      process.env.NODE_ENV = 'test';
      process.env.SESSION_SECRET = 'my-dev-secret';
      delete process.env.VERCEL;
      vi.resetModules();
      const { getSessionSecret } = await import('../../../server/config/env');

      expect(getSessionSecret()).toBe('my-dev-secret');
    });

    it('falls back to dev-secret when SESSION_SECRET not set in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.SESSION_SECRET;
      delete process.env.VERCEL;
      vi.resetModules();
      const { getSessionSecret } = await import('../../../server/config/env');

      expect(getSessionSecret()).toBe('dev-secret');
    });

    it('throws in production when SESSION_SECRET is missing', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.SESSION_SECRET;
      delete process.env.VERCEL;
      vi.resetModules();
      const { getSessionSecret } = await import('../../../server/config/env');

      expect(() => getSessionSecret()).toThrow('SESSION_SECRET');
    });
  });

  describe('isProduction', () => {
    it('is false in test environment', async () => {
      process.env.NODE_ENV = 'test';
      delete process.env.VERCEL;
      vi.resetModules();
      const { isProduction } = await import('../../../server/config/env');

      expect(isProduction).toBe(false);
    });

    it('is true when NODE_ENV is production', async () => {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { isProduction } = await import('../../../server/config/env');

      expect(isProduction).toBe(true);
    });

    it('is true when VERCEL env var is set (even without production NODE_ENV)', async () => {
      process.env.NODE_ENV = 'test';
      process.env.VERCEL = '1';
      vi.resetModules();
      const { isProduction } = await import('../../../server/config/env');

      expect(isProduction).toBe(true);
    });
  });
});
