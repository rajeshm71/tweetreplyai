import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestApp, expectJsonResponse, expectAuthError, expectValidationError, expectQuotaExceededError } from '../../helpers/request';
import { createMockUser } from '../../factories/user.factory';
import { createMockUsageStatus } from '../../factories/usage.factory';
import { setupRoutes } from '../../../server/routes';
import { signTestJwt } from '../../helpers/jwt';

// Mock the AI router
vi.mock('../../../server/services/ai-router', () => ({
  aiRouter: {
    getModelsByProvider: vi.fn(),
    generateReply: vi.fn(),
    estimateCost: vi.fn().mockReturnValue(0),
  },
}));

// Mock the usage service
vi.mock('../../../server/services/usage', () => ({
  usageService: {
    canUseReply: vi.fn(),
    getUsageStatus: vi.fn(),
    consumeReply: vi.fn(),
  },
}));

// Mock the storage module — dates are set fresh in beforeEach to avoid stale Date instances
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    createReplyEvent: vi.fn(),
    createReplyHistory: vi.fn(),
    createReplyTokens: vi.fn().mockResolvedValue(undefined),
    getReplyHistory: vi.fn().mockResolvedValue([]),
    markReplyAsUsed: vi.fn().mockResolvedValue(undefined),
    updateReplyPerformance: vi.fn().mockResolvedValue(undefined),
    getUserPreferences: vi.fn().mockResolvedValue(undefined),
    upsertUserPreferences: vi.fn(),
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

// Mock prompts service
vi.mock('../../../server/services/prompts', () => ({
  getAvailablePrompts: vi.fn().mockReturnValue([
    { name: 'default', description: 'Current production prompt - natural, casual responses' },
    { name: 'conversational', description: 'More engaging, asks questions, starts conversations' },
    { name: 'direct', description: 'Straightforward, has opinions, more decisive' },
    { name: 'supportive', description: 'More positive, encouraging, builds people up' },
    { name: 'analytical', description: 'More thoughtful, analytical, focuses on details' },
    { name: 'humorous', description: 'Observational wit—one sharp angle tied to a concrete detail in the tweet' },
  ]),
}));

// Mock tweet context analyzer
vi.mock('../../../server/services/tweet-context', () => ({
  tweetContextAnalyzer: {
    analyzeTweet: vi.fn().mockReturnValue({
      sentiment: 'neutral',
      category: 'general',
      topics: [],
      languageComplexity: 'medium',
      hasEmojis: false,
      hasMentions: false,
      hasHashtags: false,
      hasUrls: false,
    }),
    generateContextPrompt: vi.fn().mockReturnValue(''),
  },
}));

// Mock quality checker
vi.mock('../../../server/services/quality-checker', () => ({
  qualityChecker: {
    checkQuality: vi.fn().mockReturnValue({
      passed: true,
      totalScore: 85,
      parameters: [],
      issues: [],
    }),
    getImprovementSuggestions: vi.fn().mockReturnValue([]),
  },
}));

// Mock guardrail so `/api/generate-reply` doesn't depend on any real classifier behavior.
vi.mock('../../../server/services/guardrail', () => ({
  runGuardrail: vi.fn().mockResolvedValue({
    violation: 0,
    category: 'none',
    rationale: '',
    usage: undefined,
  }),
  generateGuardrailFriendlyReply: vi.fn().mockResolvedValue({
    reply: 'Guardrail-safe reply',
    modelKey: 'gpt-4o-mini',
    latencyMs: 1,
    tokensIn: 0,
    tokensOut: 0,
  }),
}));

describe('AI Endpoints - Unit Tests', () => {
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

    // Set date-dependent mocks fresh each test to prevent stale Date objects
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.createReplyHistory).mockResolvedValue({
      id: 'test-reply-history-id',
      userId: 'test-user',
      originalTweet: 'Test tweet',
      generatedReply: 'Test reply',
      wasUsed: false,
      modelKey: 'gpt-4o-mini',
      promptVariation: 'default',
      qualityScore: 85,
      createdAt: new Date(),
    } as any);
    vi.mocked(storage.upsertUserPreferences).mockResolvedValue({
      id: 'test-prefs-id',
      userId: 'test-user',
      preferredPrompt: 'default',
      preferredModel: 'gpt-4o-mini',
      tonePreference: 'casual',
      maxReplyLength: 200,
      autoRegenerate: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  // GET /api/models and GET /api/prompts tests have been moved to
  // tests/unit/routes/ai.catalog.test.ts to avoid double-execution.

  describe('POST /api/generate-reply', () => {
    const mockUser = createMockUser();
    const authToken = signTestJwt({ id: 'test-user', email: mockUser.email });
    const mockReplyResponse = {
      reply: 'This is a test reply',
      modelKey: 'gpt-3.5-turbo',
      tokensIn: 10,
      tokensOut: 15,
      latencyMs: 1000,
    };

    beforeEach(async () => {
      const { usageService } = await import('../../../server/services/usage');
      const { aiRouter } = await import('../../../server/services/ai-router');
      const { storage } = await import('../../../server/storage');

      vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: true, reason: null });
      vi.mocked(usageService.consumeReply).mockResolvedValue({
        creditsUsed: 1,
        repliesUsed: 1,
        limit: 10,
        resetAt: new Date(),
      });
      vi.mocked(aiRouter.generateReply).mockResolvedValue(mockReplyResponse);
      vi.mocked(storage.getUser).mockResolvedValue({ id: 'test-user', email: mockUser.email } as any);
      vi.mocked(storage.createReplyEvent).mockResolvedValue({});
    });

    it('should generate reply successfully', async () => {
      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
          tweet_id: '1234567890',
          model_key: 'gpt-3.5-turbo',
          prompt_variation: 'professional',
        });

      expectJsonResponse(response, 200, {
        reply: mockReplyResponse.reply,
        used: 1,
        limit: 10,
        resetAt: expect.any(String),
        meta: {
          modelKey: mockReplyResponse.modelKey,
          latencyMs: mockReplyResponse.latencyMs,
        },
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
      
      const response = await request(unauthenticatedApp)
        .post('/api/generate-reply')
        .send({
          tweet_text: 'This is a test tweet',
        });

      expectAuthError(response);
    });

    it('should validate tweet_text minimum length', async () => {
      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: '', // Empty string
        });

      expectValidationError(response);
    });

    it('should validate tweet_text maximum length', async () => {
      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'a'.repeat(2001), // Too long
        });

      expectValidationError(response);
    });

    it('should return 402 when quota exceeded', async () => {
      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.canUseReply).mockResolvedValue({ 
        canUse: false, 
        reason: 'quota_exceeded' 
      });
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus());

      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
        });

      expectQuotaExceededError(response);
    });

    it('should return 402 when payment required', async () => {
      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.canUseReply).mockResolvedValue({ 
        canUse: false, 
        reason: 'payment_required' 
      });
      vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus());

      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
        });

      expectJsonResponse(response, 402, {
        error: 'payment_required',
        message: 'No active plan',
        used: 5,
        limit: 10,
        resetAt: expect.any(String),
      });
    });

    it('should increment usage counter', async () => {
      const { usageService } = await import('../../../server/services/usage');
      const { storage } = await import('../../../server/storage');

      await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
        });

      expect(usageService.consumeReply).toHaveBeenCalledWith('test-user', 'enhanced');
    });

    it('should log reply event', async () => {
      const { storage } = await import('../../../server/storage');

      await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
          tweet_id: '1234567890',
        });

      expect(storage.createReplyEvent).toHaveBeenCalledWith({
        id: expect.any(String),
        userId: 'test-user',
        modelKey: mockReplyResponse.modelKey,
        promptKey: 'default',
        latencyMs: mockReplyResponse.latencyMs,
        tokensUsed: mockReplyResponse.tokensIn + mockReplyResponse.tokensOut,
        cost: 0,
      });
    });

    it('should handle AI service errors', async () => {
      const { aiRouter } = await import('../../../server/services/ai-router');
      vi.mocked(aiRouter.generateReply).mockRejectedValue(new Error('AI service unavailable'));

      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
        });

      expectJsonResponse(response, 500, {
        message: 'Failed to generate reply',
      });
    });

    it('should support optional model_key', async () => {
      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
          model_key: 'gpt-4',
        });

      expectJsonResponse(response, 200);
    });

    it('should support optional prompt_variation', async () => {
      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          tweet_text: 'This is a test tweet',
          prompt_variation: 'humorous',
        });

      expectJsonResponse(response, 200);
    });

    it('should handle user not found error', async () => {
      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.canUseReply).mockRejectedValue(new Error('User not found'));

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tweet_text: 'This is a test tweet' });

      expectJsonResponse(response, 404, {
        message: 'User not found',
      });
    });

    it('should return guardrail-friendly reply (not original AI reply) when guardrail fires', async () => {
      const { runGuardrail, generateGuardrailFriendlyReply } = await import('../../../server/services/guardrail');
      const { aiRouter } = await import('../../../server/services/ai-router');

      vi.mocked(runGuardrail).mockResolvedValue({
        violation: 1,
        category: 'hate_speech',
        rationale: 'Content violates policy',
        usage: undefined,
      });

      const response = await app.authenticated(mockUser)
        .post('/api/generate-reply')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ tweet_text: 'This is a test tweet' });

      expect(response.status).toBe(200);
      // Should use guardrail-friendly reply, NOT call the regular AI
      expect(vi.mocked(generateGuardrailFriendlyReply)).toHaveBeenCalled();
      expect(vi.mocked(aiRouter.generateReply)).not.toHaveBeenCalled();
      expect(response.body).toHaveProperty('reply', 'Guardrail-safe reply');
      // Meta should contain safety outcome info
      expect(response.body.meta).toHaveProperty('safetyOutcome', 'violation_friendly_reply');
    });
  });
});
