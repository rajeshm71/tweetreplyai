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
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    createReplyHistory: vi.fn(),
    createReplyTokens: vi.fn(),
  },
}));
vi.mock('../../../server/services/ai-router', () => ({
  aiRouter: {
    improveDraft: vi.fn(),
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
vi.mock('../../../server/services/guardrail', () => ({
  runGuardrail: vi.fn().mockResolvedValue({ violation: 0, category: null, rationale: '' }),
  generateGuardrailFriendlyReply: vi.fn(),
}));
vi.mock('../../../server/services/quality-checker', () => ({
  qualityChecker: {
    checkQuality: vi.fn().mockReturnValue({ passed: true, totalScore: 75, parameters: [], issues: [], suggestions: [] }),
    getImprovementSuggestions: vi.fn().mockReturnValue([]),
  },
}));

describe('AI Suggest Improvements Route - Unit Tests', () => {
  let app: any;
  const mockUser = createMockUser();
  const authToken = signTestJwt({ id: 'test-user', email: mockUser.email });
  const mockImproveResponse = { reply: 'Improved reply', modelKey: 'gpt-4o-mini', tokensIn: 20, tokensOut: 30, latencyMs: 600 };

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
    vi.mocked(usageService.consumeReply).mockResolvedValue({ creditsUsed: 2, repliesUsed: 1, limit: 10, resetAt: new Date() });
    vi.mocked(aiRouter.improveDraft).mockResolvedValue(mockImproveResponse);
    vi.mocked(storage.getUser).mockResolvedValue({ id: 'test-user', email: mockUser.email } as any);
    vi.mocked(storage.createReplyHistory).mockResolvedValue({ id: 'hist-1', userId: 'test-user', generatedReply: 'Improved', originalTweet: 'tweet', wasUsed: false, modelKey: 'gpt-4o-mini', createdAt: new Date() } as any);
    vi.mocked(storage.createReplyTokens).mockResolvedValue(undefined);
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
      .post('/api/suggest-improvements')
      .send({ draft_reply: 'Hello', original_tweet: 'Tweet' });

    expectAuthError(res);
  });

  it('returns 400 when draft_reply is missing', async () => {
    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ original_tweet: 'A tweet' });

    expectValidationError(res);
  });

  it('returns 400 when original_tweet is missing', async () => {
    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'My reply' });

    expectValidationError(res);
  });

  it('returns 400 when draft_reply exceeds max length', async () => {
    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'a'.repeat(501), original_tweet: 'A tweet' });

    expectValidationError(res);
  });

  it('returns 200 with improved reply on success', async () => {
    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'My draft reply', original_tweet: 'The original tweet' });

    expectJsonResponse(res, 200, {
      improved: mockImproveResponse.reply,
    });
    expect(res.body).toHaveProperty('qualityScore');
    expect(res.body).toHaveProperty('original');
  });

  it('returns 402 when quota exceeded', async () => {
    const { usageService } = await import('../../../server/services/usage');
    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: false, reason: 'quota_exceeded' });
    vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus({ used: 10, limit: 10 }));

    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'My draft', original_tweet: 'Tweet' });

    expectQuotaExceededError(res);
  });

  it('returns 404 when user not found', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getUser).mockResolvedValue(null);

    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'My draft', original_tweet: 'Tweet' });

    expectJsonResponse(res, 404, { message: 'User not found' });
  });

  it('returns 500 when AI service errors', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.improveDraft).mockRejectedValue(new Error('AI service down'));

    const res = await app.raw()
      .post('/api/suggest-improvements')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ draft_reply: 'My draft', original_tweet: 'Tweet' });

    expectJsonResponse(res, 500, { message: expect.stringContaining('improvement') });
  });
});
