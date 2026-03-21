import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import request from 'supertest';

vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn(() => 'test-user'),
}));
vi.mock('../../../server/localAuth', () => ({ setupLocalAuth: vi.fn() }));

// Mock passport so we can control OAuth behaviour without real Google credentials
vi.mock('passport', () => {
  const authenticate = vi.fn((_strategy: string, _options?: any) => {
    return (_req: any, res: any, _next: any) => {
      // Default: simulate a redirect to Google
      res.redirect('https://accounts.google.com/o/oauth2/auth?client_id=test');
    };
  });
  return {
    default: {
      authenticate,
      use: vi.fn(),
      serializeUser: vi.fn(),
      deserializeUser: vi.fn(),
      initialize: vi.fn(() => (_req: any, _res: any, next: any) => next()),
      session: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    },
    authenticate,
    use: vi.fn(),
    serializeUser: vi.fn(),
    deserializeUser: vi.fn(),
    initialize: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    session: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  };
});

describe('Auth OAuth Routes - Unit Tests', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
      req.isAuthenticated = () => false;
      req.logout = vi.fn((cb: any) => cb());
      next();
    });
    await setupRoutes(app);
  });

  describe('GET /api/auth/google', () => {
    it('issues a redirect (302) to Google OAuth', async () => {
      const res = await request(app).get('/api/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers['location']).toMatch(/accounts\.google\.com/);
    });
  });

  describe('GET /api/auth/google/callback', () => {
    it('redirects to /login on OAuth failure', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementationOnce(
        (_strategy: string, _options?: any) =>
          (_req: any, res: any, _next: any) => {
            res.redirect('/login');
          }
      );

      const res = await request(app).get('/api/auth/google/callback?error=access_denied');
      expect(res.status).toBe(302);
      expect(res.headers['location']).toContain('/login');
    });
  });
});
