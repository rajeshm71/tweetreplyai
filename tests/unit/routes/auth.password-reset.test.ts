import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp, expectJsonResponse, expectValidationError } from '../../helpers/request';

vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn(() => 'test-user'),
}));
vi.mock('../../../server/localAuth', () => ({ setupLocalAuth: vi.fn() }));
vi.mock('../../../server/storage', () => ({
  storage: {
    getUserByEmail: vi.fn(),
    setUserResetToken: vi.fn(),
    getUserByResetToken: vi.fn(),
    updateUser: vi.fn(),
    clearUserResetToken: vi.fn(),
  },
}));
vi.mock('../../../server/utils/email', () => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

describe('Auth Password Reset Routes - Unit Tests', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns 200 and success message when user exists with password', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByEmail).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: 'hashed',
        authProviders: ['password'],
      } as any);
      vi.mocked(storage.setUserResetToken).mockResolvedValue(undefined);

      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' });

      expectJsonResponse(res, 200, { message: 'Password reset email sent.' });
    });

    it('returns 404 when email is not registered', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByEmail).mockResolvedValue(null);

      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expectJsonResponse(res, 404, { message: 'No account found with that email.' });
    });

    it('returns 400 for Google-only account (no password)', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByEmail).mockResolvedValue({
        id: 'user-2',
        email: 'google@example.com',
        password: null,
        authProviders: ['google'],
      } as any);

      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({ email: 'google@example.com' });

      expectJsonResponse(res, 400, { message: expect.stringContaining('Google') });
    });

    it('returns 400 when email format is invalid', async () => {
      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expectValidationError(res);
    });

    it('returns 400 when email is missing', async () => {
      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({});

      expectValidationError(res);
    });

    it('returns 500 when storage throws', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByEmail).mockRejectedValue(new Error('DB error'));

      const res = await app.raw()
        .post('/api/auth/forgot-password')
        .send({ email: 'user@example.com' });

      expectJsonResponse(res, 500, { message: expect.stringContaining('password reset') });
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('returns 200 when token is valid and password is strong', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByResetToken).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: 'old-hash',
      } as any);
      vi.mocked(storage.updateUser).mockResolvedValue({} as any);
      vi.mocked(storage.clearUserResetToken).mockResolvedValue(undefined);

      const res = await app.raw()
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token-abc', newPassword: 'StrongPass123!' });

      expectJsonResponse(res, 200, { message: expect.stringContaining('Password reset') });
    });

    it('returns 400 when token is invalid or expired', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByResetToken).mockResolvedValue(null);

      const res = await app.raw()
        .post('/api/auth/reset-password')
        .send({ token: 'bad-token', newPassword: 'StrongPass123!' });

      expectJsonResponse(res, 400, { message: expect.stringContaining('Invalid') });
    });

    it('returns 400 when new password fails strength validation', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByResetToken).mockResolvedValue({
        id: 'user-1',
        email: 'user@example.com',
        password: 'old-hash',
      } as any);

      const res = await app.raw()
        .post('/api/auth/reset-password')
        .send({ token: 'valid-token', newPassword: 'weak' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('message');
    });

    it('returns 400 when token field is missing', async () => {
      const res = await app.raw()
        .post('/api/auth/reset-password')
        .send({ newPassword: 'StrongPass123!' });

      expectValidationError(res);
    });

    it('returns 500 when storage throws during reset', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByResetToken).mockRejectedValue(new Error('DB error'));

      const res = await app.raw()
        .post('/api/auth/reset-password')
        .send({ token: 'any-token', newPassword: 'StrongPass123!' });

      expectJsonResponse(res, 500, { message: expect.stringContaining('reset password') });
    });
  });
});
