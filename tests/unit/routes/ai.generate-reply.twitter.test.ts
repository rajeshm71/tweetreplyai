import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp, expectJsonResponse, expectAuthError, expectValidationError, expectQuotaExceededError } from '../../helpers/request';
import { createMockUser } from '../../factories/user.factory';
import { createMockUsageStatus } from '../../factories/usage.factory';
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
vi.mock('../../../server/services/ai-router', () => ({
  aiRouter: {
    getModelsByProvider: vi.fn(),
    generateReply: vi.fn(),
    estimateCost: vi.fn().mockReturnValue(0),
  },
}));
vi.mock('../../../server/services/usage', () => ({
  usageService: {
    canUseReply: vi.fn(),
    getUsageStatus: vi.fn(),
    consumeReply: vi.fn(),
  },
}));
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    createReplyEvent: vi.fn(),
    createReplyHistory: vi.fn(),
    createReplyTokens: vi.fn(),
    getReplyHistory: vi.fn(),
    markReplyAsUsed: vi.fn(),
    updateReplyPerformance: vi.fn(),
    getUserPreferences: vi.fn(),
    upsertUserPreferences: vi.fn(),
  },
}));
vi.mock('../../../server/services/guardrail', () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: null, rationale: '' }),
  generateGuardrailFriendlyReply: vi.fn().mockResolvedValue({
    reply: 'Guardrail-safe reply',
    modelKey: 'gpt-4o-mini',
    latencyMs: 1,
    tokensIn: 0,
    tokensOut: 0,
  }),
}));
vi.mock('../../../server/services/tweet-context', () => ({
  tweetContextAnalyzer: {
    analyzeTweet: vi.fn().mockReturnValue({ sentiment: 'neutral', category: 'general', topics: [], languageComplexity: 'medium', hasEmojis: false, hasMentions: false, hasHashtags: false, hasUrls: false }),
    generateContextPrompt: vi.fn().mockReturnValue(''),
  },
}));
vi.mock('../../../server/services/quality-checker', () => ({
  qualityChecker: {
    checkQuality: vi.fn().mockReturnValue({ passed: true, totalScore: 85, parameters: [], issues: [] }),
    getImprovementSuggestions: vi.fn().mockReturnValue([]),
  },
}));
vi.mock('../../../server/services/prompts', () => ({
  getAvailablePrompts: vi.fn().mockReturnValue([{ name: 'default', description: 'Natural, casual responses' }]),
}));

describe('AI Generate Reply (Twitter) - Unit Tests', () => {
  let app: any;
  const mockUser = createMockUser();
  const authToken = signTestJwt({ id: 'test-user', email: mockUser.email });
  const mockReply = { reply: 'Test reply', modelKey: 'gpt-4o-mini', tokensIn: 10, tokensOut: 15, latencyMs: 500 };

  beforeEach(async () => {
    vi.clearAllMocks();

    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);

    const { usageService } = await import('../../../server/services/usage');
    const { aiRouter } = await import('../../../server/services/ai-router');
    const { storage } = await import('../../../server/storage');

    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: true, reason: null });
    vi.mocked(usageService.consumeReply).mockResolvedValue({ creditsUsed: 1, repliesUsed: 1, limit: 10, resetAt: new Date() });
    vi.mocked(aiRouter.generateReply).mockResolvedValue(mockReply);
    vi.mocked(storage.getUser).mockResolvedValue({ id: 'test-user', email: mockUser.email } as any);
    vi.mocked(storage.createReplyEvent).mockResolvedValue({} as any);
    vi.mocked(storage.createReplyHistory).mockResolvedValue({ id: 'hist-1', userId: 'test-user', generatedReply: mockReply.reply, originalTweet: 'tweet', wasUsed: false, modelKey: 'gpt-4o-mini', createdAt: new Date() } as any);
    vi.mocked(storage.createReplyTokens).mockResolvedValue(undefined);
    vi.mocked(storage.getUserPreferences).mockResolvedValue(undefined);
    vi.mocked(storage.upsertUserPreferences).mockResolvedValue({ id: 'pref-1', userId: 'test-user', preferredPrompt: 'default', preferredModel: 'gpt-4o-mini', tonePreference: 'casual', maxReplyLength: 200, autoRegenerate: true, createdAt: new Date(), updatedAt: new Date() } as any);
  });

  it('generates a Twitter reply successfully', async () => {
    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'This is a test tweet', platform: 'twitter' });

    expectJsonResponse(res, 200, {
      reply: mockReply.reply,
      meta: { modelKey: mockReply.modelKey, latencyMs: mockReply.latencyMs },
    });
  });

  it('defaults to twitter platform when platform not specified', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Default platform tweet' });

    expect(res.status).toBe(200);
    expect(vi.mocked(aiRouter.generateReply)).toHaveBeenCalled();
  });

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
      .post('/api/generate-reply')
      .send({ tweet_text: 'Test' });

    expectAuthError(res);
  });

  it('returns 400 when tweet_text is empty', async () => {
    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: '' });

    expectValidationError(res);
  });

  it('returns 400 when tweet_text exceeds max length', async () => {
    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'a'.repeat(2001) });

    expectValidationError(res);
  });

  it('returns 402 when quota is exceeded', async () => {
    const { usageService } = await import('../../../server/services/usage');
    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: false, reason: 'quota_exceeded' });
    vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus({ used: 10, limit: 10 }));

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'This is a test tweet' });

    expectQuotaExceededError(res);
  });

  it('returns 402 when payment is required', async () => {
    const { usageService } = await import('../../../server/services/usage');
    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: false, reason: 'payment_required' });
    vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus({ used: 0, limit: 0 }));

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'This is a test tweet' });

    expectJsonResponse(res, 402, { error: 'payment_required' });
  });

  it('returns 500 when AI service errors', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.generateReply).mockRejectedValue(new Error('AI unavailable'));

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'This is a test tweet' });

    expectJsonResponse(res, 500, { message: 'Failed to generate reply' });
  });

  it('returns guardrail-friendly reply when guardrail fires', async () => {
    const { runGuardrail, generateGuardrailFriendlyReply } = await import('../../../server/services/guardrail');
    vi.mocked(runGuardrail).mockResolvedValue({ violation: 1, category: 'hate_speech', rationale: 'Not allowed' });

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'This is a test tweet' });

    expect(res.status).toBe(200);
    expect(vi.mocked(generateGuardrailFriendlyReply)).toHaveBeenCalled();
    expect(res.body).toHaveProperty('reply');
  });
});
