import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp, expectJsonResponse, expectAuthError } from '../../helpers/request';
import { signTestJwt } from '../../helpers/jwt';

vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'test-user' };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn(() => 'test-user'),
}));
vi.mock('../../../server/localAuth', () => ({ setupLocalAuth: vi.fn() }));
vi.mock('../../../server/storage', () => ({
  storage: {
    getActiveSubscription: vi.fn(),
  },
}));
vi.mock('../../../server/services/usage', () => ({
  usageService: {
    getUsageStatus: vi.fn(),
  },
}));
vi.mock('../../../server/services/dodo-payments', () => ({
  PLANS: {
    weekly: { code: 'weekly', name: 'Weekly', price: 299, replies: 10, interval: 'week' },
  },
  dodoPaymentsService: { cancelSubscription: vi.fn() },
}));

describe('Subscription Details Route - Unit Tests', () => {
  let app: any;
  const authToken = signTestJwt({ id: 'test-user', email: 'user@example.com' });

  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  describe('GET /api/subscription', () => {
    it('returns 401 when not authenticated', async () => {
      const unauthApp = express();
      unauthApp.use(express.json());
      unauthApp.use((req: any, _res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = () => false;
        req.logout = vi.fn((cb: any) => cb());
        next();
      });
      await setupRoutes(unauthApp);

      const res = await createTestApp(unauthApp).raw()
        .get('/api/subscription');

      expectAuthError(res);
    });

    it('returns subscription details when user has active subscription', async () => {
      const { storage } = await import('../../../server/storage');
      const { usageService } = await import('../../../server/services/usage');

      vi.mocked(storage.getActiveSubscription).mockResolvedValue({
        id: 'sub-1',
        userId: 'test-user',
        planCode: 'weekly',
        status: 'active',
        dodoSubscriptionId: 'dodo-sub-1',
        currentPeriodStart: new Date('2024-01-01'),
        currentPeriodEnd: new Date('2024-01-08'),
        cancelAt: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      } as any);

      vi.mocked(usageService.getUsageStatus).mockResolvedValue({
        planCode: 'weekly',
        used: 5,
        limit: 100,
        status: 'active',
        resetAt: new Date('2024-01-08'),
      } as any);

      const res = await app.raw()
        .get('/api/subscription')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('subscription');
      expect(res.body).toHaveProperty('planDetails');
      expect(res.body).toHaveProperty('usageStatus');
      expect(res.body.usageStatus.planCode).toBe('weekly');
    });

    it('returns trial plan details when no active subscription', async () => {
      const { storage } = await import('../../../server/storage');
      const { usageService } = await import('../../../server/services/usage');

      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(usageService.getUsageStatus).mockResolvedValue({
        planCode: 'trial',
        used: 2,
        limit: 10,
        status: 'active',
        resetAt: new Date(),
      } as any);

      const res = await app.raw()
        .get('/api/subscription')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.subscription).toBeNull();
      expect(res.body.planDetails.code).toBe('trial');
    });

    it('returns 404 when usage status not found', async () => {
      const { storage } = await import('../../../server/storage');
      const { usageService } = await import('../../../server/services/usage');

      vi.mocked(storage.getActiveSubscription).mockResolvedValue(null);
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(null);

      const res = await app.raw()
        .get('/api/subscription')
        .set('Authorization', `Bearer ${authToken}`);

      expectJsonResponse(res, 404, { message: 'Usage status not found' });
    });

    it('returns 500 on storage error', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getActiveSubscription).mockRejectedValue(new Error('DB error'));

      const res = await app.raw()
        .get('/api/subscription')
        .set('Authorization', `Bearer ${authToken}`);

      expectJsonResponse(res, 500, { message: 'Failed to fetch subscription' });
    });
  });
});
