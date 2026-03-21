import { describe, expect, it, vi, afterEach } from 'vitest';

const savedCorsOrigins = process.env.CORS_ORIGINS;

// Helper: call the origin function and get the result
async function checkOrigin(origin: string | undefined): Promise<{ err: Error | null; allow: boolean | string | undefined }> {
  vi.resetModules();
  const { corsApiOptions } = await import('../../../server/config/cors');
  return new Promise((resolve) => {
    corsApiOptions.origin(origin, (err, allow) => resolve({ err, allow }));
  });
}

describe('CORS Config - Unit Tests', () => {
  afterEach(() => {
    if (savedCorsOrigins !== undefined) {
      process.env.CORS_ORIGINS = savedCorsOrigins;
    } else {
      delete process.env.CORS_ORIGINS;
    }
  });

  describe('corsApiOptions.origin', () => {
    it('allows undefined origin (server-to-server / same-origin)', async () => {
      const { err, allow } = await checkOrigin(undefined);
      expect(err).toBeNull();
      expect(allow).toBe(true);
    });

    it('allows known built-in origin', async () => {
      const { err, allow } = await checkOrigin('https://tweetreplyai.vercel.app');
      expect(err).toBeNull();
      expect(allow).toBe('https://tweetreplyai.vercel.app');
    });

    it('allows localhost:5173', async () => {
      const { err, allow } = await checkOrigin('http://localhost:5173');
      expect(err).toBeNull();
      expect(allow).toBe('http://localhost:5173');
    });

    it('allows chrome-extension:// origins', async () => {
      const { err, allow } = await checkOrigin('chrome-extension://abcdefgh1234');
      expect(err).toBeNull();
      expect(allow).toBe('chrome-extension://abcdefgh1234');
    });

    it('blocks unknown origin', async () => {
      const { err, allow } = await checkOrigin('https://hacker.io');
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });

    it('blocks evil lookalike domain', async () => {
      const { err, allow } = await checkOrigin('https://eviltweetreplyai.com');
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });

    it('does not throw on malformed origin string', async () => {
      // originMatchesDomainPattern uses try/catch for URL parse errors
      const { err, allow } = await checkOrigin('not-a-url');
      expect(err).toBeNull();
      expect(allow).toBe(false);
    });
  });

  describe('corsApiOptions.origin — with CORS_ORIGINS env var', () => {
    it('allows custom exact origin from CORS_ORIGINS', async () => {
      process.env.CORS_ORIGINS = 'https://custom-app.com';
      const { err, allow } = await checkOrigin('https://custom-app.com');
      expect(err).toBeNull();
      expect(allow).toBe('https://custom-app.com');
    });

    it('allows wildcard subdomain from CORS_ORIGINS (*.tweetreplyai.com)', async () => {
      process.env.CORS_ORIGINS = '*.tweetreplyai.com';
      const { err, allow } = await checkOrigin('https://staging.tweetreplyai.com');
      expect(err).toBeNull();
      expect(allow).toBe('https://staging.tweetreplyai.com');
    });

    it('allows root domain match for wildcard pattern', async () => {
      process.env.CORS_ORIGINS = '*.tweetreplyai.com';
      const { err, allow } = await checkOrigin('https://tweetreplyai.com');
      expect(err).toBeNull();
      expect(allow).toBe('https://tweetreplyai.com');
    });
  });

  describe('corsApiOptions — shape', () => {
    it('includes credentials:true', async () => {
      vi.resetModules();
      const { corsApiOptions } = await import('../../../server/config/cors');
      expect(corsApiOptions.credentials).toBe(true);
    });

    it('includes required HTTP methods', async () => {
      vi.resetModules();
      const { corsApiOptions } = await import('../../../server/config/cors');
      expect(corsApiOptions.methods).toContain('GET');
      expect(corsApiOptions.methods).toContain('POST');
      expect(corsApiOptions.methods).toContain('DELETE');
    });
  });
});
