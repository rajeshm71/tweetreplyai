import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import { createTestApp, expectJsonResponse, expectAuthError, expectValidationError } from '../../helpers/request';
import { createMockUser } from '../../factories/user.factory';
import { setupRoutes } from '../../../server/routes';

// Mock the storage module
vi.mock('../../../server/storage', () => ({
  storage: {
    createFeedback: vi.fn(),
  },
}));

// Mock replitAuth to avoid environment variable issues
vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, res: any, next: any) => {
    // Mock authentication middleware - always allow
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

describe('Feedback Endpoints - Unit Tests', () => {
  let app: any;
  let expressApp: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create a real Express app with actual routes
    expressApp = express();
    expressApp.use(express.json());

    // Mock authentication middleware - will be overridden per test
    expressApp.use((req: any, res: any, next: any) => {
      // Set up authentication for all requests
      req.user = { id: 'test-user' };
      req.isAuthenticated = vi.fn(() => true);
      req.logout = vi.fn((cb: any) => cb());
      next();
    });

    // Setup actual routes
    await setupRoutes(expressApp);

    app = createTestApp(expressApp);
  });

  describe('POST /api/feedback', () => {
    it('should create feedback successfully', async () => {
      const mockUser = createMockUser();
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'up',
        comment: 'Great service!',
        replyEventId: 'reply-event-123',
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      const response = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'up',
          comment: 'Great service!',
          reply_event_id: 123,
        });

      expectJsonResponse(response, 200, {
        success: true,
      });
    });

    it('should require authentication', async () => {
      // Create a separate app instance for unauthenticated testing
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());

      // Set up authentication middleware that always denies
      unauthenticatedApp.use((req: any, res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = vi.fn(() => false);
        req.logout = vi.fn((cb: any) => cb());
        next();
      });

      // Setup routes
      await setupRoutes(unauthenticatedApp);

      const unauthApp = createTestApp(unauthenticatedApp);
      const response = await unauthApp.raw()
        .post('/api/feedback')
        .send({
          rating: 'up',
        });

      expectAuthError(response);
    });

    it('should validate rating (up/down only)', async () => {
      const response = await app.raw()
        .post('/api/feedback')
        .send({
          rating: 'invalid_rating',
        });

      expectValidationError(response, ['rating']);
    });

    it('should allow optional reply_event_id', async () => {
      const mockUser = createMockUser();
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'up',
        comment: null,
        replyEventId: null,
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      const response = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'up',
        });

      expectJsonResponse(response, 200, {
        success: true,
      });
    });

    it('should allow optional comment', async () => {
      const mockUser = createMockUser();
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'down',
        comment: null,
        replyEventId: 'reply-event-123',
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      const response = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'down',
          reply_event_id: 123,
        });

      expectJsonResponse(response, 200, {
        success: true,
      });
    });

    it('should return success response', async () => {
      const mockUser = createMockUser();
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'up',
        comment: 'Great service!',
        replyEventId: 'reply-event-123',
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      const response = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'up',
          comment: 'Great service!',
          reply_event_id: 123,
        });

      expect(response.body).toHaveProperty('success', true);
    });

    it('should handle storage errors', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockRejectedValue(new Error('Database error'));

      const response = await app.raw()
        .post('/api/feedback')
        .send({
          rating: 'up',
          comment: 'Great service!',
        });

      expectJsonResponse(response, 500, {
        message: 'Failed to create feedback',
      });
    });

    it('should validate required rating field', async () => {
      const response = await app.raw()
        .post('/api/feedback')
        .send({
          comment: 'Great service!',
        });

      expectValidationError(response, ['rating']);
    });

    it('should handle both up and down ratings', async () => {
      const mockUser = createMockUser();
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'up',
        comment: 'Great!',
        replyEventId: null,
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      // Test up rating
      const upResponse = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'up',
          comment: 'Great!',
        });

      expectJsonResponse(upResponse, 200, {
        success: true,
      });

      // Test down rating
      const downFeedback = { ...mockFeedback, rating: 'down' };
      vi.mocked(storage.createFeedback).mockResolvedValue(downFeedback);

      const downResponse = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'down',
          comment: 'Not great!',
        });

      expectJsonResponse(downResponse, 200, {
        success: true,
      });
    });

    it('should handle long comments', async () => {
      const mockUser = createMockUser();
      const longComment = 'A'.repeat(1000); // Very long comment
      const mockFeedback = {
        id: 'feedback-123',
        userId: mockUser.id,
        rating: 'up',
        comment: longComment,
        replyEventId: null,
        createdAt: new Date(),
      };

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.createFeedback).mockResolvedValue(mockFeedback);

      const response = await app.authenticated(mockUser)
        .post('/api/feedback')
        .send({
          rating: 'up',
          comment: longComment,
        });

      expectJsonResponse(response, 200, {
        success: true,
      });
    });
  });
});