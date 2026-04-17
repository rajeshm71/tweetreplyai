import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import {
  createTestApp,
  expectJsonResponse,
  expectAuthError,
  expectValidationError,
  expectQuotaExceededError,
} from '../../helpers/request';
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
    reframeTweet: vi.fn(),
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
    checkQuality: vi.fn().mockReturnValue({
      passed: true,
      totalScore: 82,
      parameters: [],
      issues: [],
      suggestions: [],
    }),
    getImprovementSuggestions: vi.fn().mockReturnValue([]),
  },
}));

describe('AI Reframe Tweet Route - Unit Tests', () => {
  let app: any;
  const mockUser = createMockUser();
  const authToken = signTestJwt({ id: 'test-user', email: mockUser.email });
  const mockReframeResponse = {
    reply: 'A freshly reframed version of the tweet',
    modelKey: 'gpt-4o-mini',
    tokensIn: 30,
    tokensOut: 45,
    latencyMs: 700,
  };

  const validSource = 'Why is learning TypeScript worth the investment for web devs in 2026?';

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
    vi.mocked(usageService.consumeReply).mockResolvedValue({
      creditsUsed: 2,
      repliesUsed: 1,
      limit: 100,
      resetAt: new Date('2026-05-01T00:00:00.000Z'),
    } as any);
    vi.mocked(aiRouter.reframeTweet).mockResolvedValue(mockReframeResponse);
    vi.mocked(storage.getUser).mockResolvedValue({ id: 'test-user', email: mockUser.email } as any);
    vi.mocked(storage.createReplyHistory).mockResolvedValue({
      id: 'hist-1',
      userId: 'test-user',
      generatedReply: mockReframeResponse.reply,
      originalTweet: validSource,
      wasUsed: false,
      modelKey: mockReframeResponse.modelKey,
      createdAt: new Date(),
    } as any);
    vi.mocked(storage.createReplyTokens).mockResolvedValue(undefined as any);
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

    const res = await createTestApp(unauthApp)
      .raw()
      .post('/api/reframe-tweet')
      .send({ source_tweet: validSource, degree: 50 });

    expectAuthError(res);
  });

  it('returns 400 when source_tweet is missing', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ degree: 50 });

    expectValidationError(res);
  });

  it('returns 400 when source_tweet is shorter than the minimum', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: 'too short', degree: 50 });

    expectValidationError(res);
  });

  it('returns 400 when degree is out of range', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 150 });

    expectValidationError(res);
  });

  it('returns 400 when degree is a float', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 55.5 });

    expectValidationError(res);
  });

  it('returns 200 with reframed tweet on success', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 80, prompt_variation: 'direct' });

    expectJsonResponse(res, 200, {
      reframed: mockReframeResponse.reply,
      degree: 80,
      band: 'heavy',
    });
    expect(res.body).toHaveProperty('qualityScore');
    expect(res.body).toHaveProperty('used');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('resetAt');
    expect(res.body.meta).toMatchObject({
      modelKey: mockReframeResponse.modelKey,
      promptVariation: 'direct',
    });

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledWith(
      validSource,
      80,
      expect.objectContaining({ allowLong: false, promptVariation: 'direct' }),
    );
  });

  it('preserves newlines from the AI response in the API response body', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    const multilineReply = "You don't hate working.\nYou hate working hard and still being broke.";
    vi.mocked(aiRouter.reframeTweet).mockResolvedValue({
      ...mockReframeResponse,
      reply: multilineReply,
    });

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expect(res.status).toBe(200);
    expect(res.body.reframed).toBe(multilineReply);
    expect(res.body.reframed.includes('\n')).toBe(true);
    expect(res.body.reframed.split('\n').length).toBe(2);
  });

  it('persists reply_history with replyMode="reframe" and promptKey="reframe"', async () => {
    await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 45 });

    const { storage } = await import('../../../server/storage');
    const historyCall = vi.mocked(storage.createReplyHistory).mock.calls[0]?.[0];
    expect(historyCall).toBeDefined();
    expect(historyCall).toMatchObject({
      replyMode: 'reframe',
      promptKey: 'reframe',
      originalTweet: validSource,
    });
  });

  it('returns 402 when quota exceeded and does NOT consume credits', async () => {
    const { usageService } = await import('../../../server/services/usage');
    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: false, reason: 'quota_exceeded' });
    vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus({ used: 100, limit: 100 }));

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expectQuotaExceededError(res);
    expect(vi.mocked(usageService.consumeReply)).not.toHaveBeenCalled();
  });

  it('returns 404 when user not found', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getUser).mockResolvedValue(null);

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expectJsonResponse(res, 404, { message: 'User not found' });
  });

  it('guardrail violation path persists promptKey="reframe_guardrail_violation"', async () => {
    const { runGuardrail, generateGuardrailFriendlyReply } = await import(
      '../../../server/services/guardrail'
    );
    vi.mocked(runGuardrail).mockResolvedValueOnce({
      violation: 1,
      category: 'harassment',
      rationale: 'not allowed',
    } as any);
    vi.mocked(generateGuardrailFriendlyReply).mockResolvedValueOnce({
      reply: 'I cannot help reframe that tweet.',
      modelKey: 'gpt-4o-mini',
      tokensIn: 10,
      tokensOut: 12,
      latencyMs: 150,
    } as any);

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expectJsonResponse(res, 200);
    expect(res.body.meta.safetyOutcome).toBe('violation_friendly_reply');

    const { storage } = await import('../../../server/storage');
    const historyCall = vi.mocked(storage.createReplyHistory).mock.calls[0]?.[0];
    expect(historyCall).toMatchObject({
      promptKey: 'reframe_guardrail_violation',
      replyMode: 'reframe',
    });

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).not.toHaveBeenCalled();
  });

  it('returns 500 when AI service errors (credits already consumed)', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.reframeTweet).mockRejectedValue(new Error('AI service down'));

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expectJsonResponse(res, 500, { message: expect.stringContaining('reframe') });
  });

  it('forwards allow_long=true to aiRouter.reframeTweet', async () => {
    await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 60, allow_long: true });

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledWith(
      validSource,
      60,
      expect.objectContaining({ allowLong: true }),
    );
  });
});
