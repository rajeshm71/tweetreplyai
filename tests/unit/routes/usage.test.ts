import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestApp, expectJsonResponse, expectAuthError, expectNotFoundError } from '../../helpers/request';
import { createMockUser } from '../../factories/user.factory';
import { createMockUsageStatus } from '../../factories/usage.factory';
import { setupRoutes } from '../../../server/routes';
import { signTestJwt } from '../../helpers/jwt';

// Mock the usage service
vi.mock('../../../server/services/usage', () => ({
  usageService: {
    getUsageStatus: vi.fn(),
  },
}));

// Mock storage used by `/api/usage` (route calls storage.getUser(userId))
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
  },
}));

// Mock replitAuth to avoid environment variable issues
vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, res: any, next: any) => {
    req.user = { id: 'test-user' };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn((req: any) => req.user?.id || 'test-user'),
}));

// Mock local auth functions
vi.mock('../../../server/localAuth', () => ({
  setupLocalAuth: vi.fn(),
}));

describe('Usage Endpoints - Unit Tests', () => {
  let app: any;
  let expressApp: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a real Express app with actual routes
    expressApp = express();
    expressApp.use(express.json());

    // Mock authentication middleware - will be overridden per test
    expressApp.use((req: any, res: any, next: any) => {
      req.user = { id: 'test-user' };
      req.isAuthenticated = vi.fn(() => true);
      req.logout = vi.fn((cb: any) => cb());
      next();
    });

    // Setup actual routes
    await setupRoutes(expressApp);

    app = createTestApp(expressApp);
  });

  describe('GET /api/usage', () => {
    it('should return usage status for authenticated user', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });
      const mockUsageStatus = createMockUsageStatus({
        used: 5,
        limit: 10,
        resetAt: new Date('2024-01-31'),
        planCode: 'trial',
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(mockUsageStatus);

      const response = await app.authenticated(mockUser)
        .get('/api/usage')
        .set('Authorization', `Bearer ${token}`);

      expectJsonResponse(response, 200, {
        used: mockUsageStatus.used,
        limit: mockUsageStatus.limit,
        resetAt: expect.any(String), // API returns ISO string
        planCode: mockUsageStatus.planCode,
        status: expect.any(String),
      });
    });

    it('should return 401 when not authenticated', async () => {
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());
      
      // Mock authentication middleware that always denies
      unauthenticatedApp.use((req: any, res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = vi.fn(() => false);
        req.logout = vi.fn((cb: any) => cb());
        next();
      });
      
      await setupRoutes(unauthenticatedApp);
      const unauthApp = createTestApp(unauthenticatedApp);

      const response = await unauthApp.raw()
        .get('/api/usage');

      expectAuthError(response);
    });

    it('should show correct used/limit/resetAt values', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });
      const mockUsageStatus = createMockUsageStatus({
        used: 7,
        limit: 50,
        resetAt: new Date('2024-02-15'),
        planCode: 'weekly',
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(mockUsageStatus);

      const response = await app.authenticated(mockUser)
        .get('/api/usage')
        .set('Authorization', `Bearer ${token}`);

      expect(response.body.used).toBe(7);
      expect(response.body.limit).toBe(50);
      expect(response.body.planCode).toBe('weekly');
      expect(response.body.resetAt).toBe(mockUsageStatus.resetAt.toISOString());
    });

    it('should return 404 for user without usage counter', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(null);

      const response = await app.authenticated(mockUser)
        .get('/api/usage')
        .set('Authorization', `Bearer ${token}`);

      expectJsonResponse(response, 404, { message: "User not found" });
    });

    it('should handle usage service errors', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.getUsageStatus).mockRejectedValue(new Error('Database error'));

      const response = await app.authenticated(mockUser)
        .get('/api/usage')
        .set('Authorization', `Bearer ${token}`);

      expectJsonResponse(response, 500, {
        message: 'Failed to fetch usage',
      });
    });

    it('should handle different plan types', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });
      const testCases = [
        { planCode: 'trial', limit: 10 },
        { planCode: 'weekly', limit: 50 },
        { planCode: 'monthly', limit: 200 },
      ];

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');

      for (const testCase of testCases) {
        const mockUsageStatus = createMockUsageStatus(testCase);
        vi.mocked(usageService.getUsageStatus).mockResolvedValue(mockUsageStatus);

        const response = await app.authenticated(mockUser)
          .get('/api/usage')
          .set('Authorization', `Bearer ${token}`);

        expectJsonResponse(response, 200, {
          planCode: testCase.planCode,
          limit: testCase.limit,
          used: expect.any(Number),
          resetAt: expect.any(String),
          status: expect.any(String),
        });
      }
    });

    it('should handle expired usage counter', async () => {
      const mockUser = createMockUser();
      const token = signTestJwt({ id: mockUser.id, email: mockUser.email });
      const expiredDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday
      const mockUsageStatus = createMockUsageStatus({
        used: 5,
        limit: 10,
        resetAt: expiredDate,
        planCode: 'trial',
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(mockUsageStatus);

      const response = await app.authenticated(mockUser)
        .get('/api/usage')
        .set('Authorization', `Bearer ${token}`);

      expectJsonResponse(response, 200, {
        used: 5,
        limit: 10,
        resetAt: expiredDate.toISOString(),
        planCode: 'trial',
        status: expect.any(String),
      });
    });
  });
});
