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

const { reportRouteErrorMock } = vi.hoisted(() => ({
  reportRouteErrorMock: vi.fn(),
}));

vi.mock('../../../server/utils/sentry.js', () => ({
  tagRequestUser: vi.fn(),
  reportRouteError: (...args: unknown[]) => reportRouteErrorMock(...args),
}));

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
    reportRouteErrorMock.mockClear();

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
      .send({ source_tweet: validSource, degree: 80 });

    expectJsonResponse(res, 200, {
      reframed: mockReframeResponse.reply,
      degree: 80,
      band: 'heavy',
    });
    expect(res.body).toHaveProperty('qualityScore');
    expect(res.body).toHaveProperty('originalityScore');
    expect(res.body).toHaveProperty('used');
    expect(res.body).toHaveProperty('limit');
    expect(res.body).toHaveProperty('resetAt');
    expect(res.body.meta).toMatchObject({
      modelKey: mockReframeResponse.modelKey,
      originalityScore: expect.any(Number),
    });

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledWith(
      validSource,
      80,
      expect.objectContaining({ allowLong: false }),
    );
  });

  it('retries once with retryBoost when first draft fails originality at heavy band', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.reframeTweet)
      .mockResolvedValueOnce({
        ...mockReframeResponse,
        reply: validSource,
      })
      .mockResolvedValueOnce({
        ...mockReframeResponse,
        reply: 'A completely fresh take on why TypeScript still matters for web teams.',
      });

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 75 });

    expect(res.status).toBe(200);
    expect(res.body.reframed).toContain('fresh take');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(aiRouter.reframeTweet).mock.calls[1]?.[2]).toMatchObject({
      retryBoost: true,
    });
    expect(res.body.meta.retriedForOriginality).toBe(true);
  });

  it('logs both generation stages in reply_tokens when originality retry runs', async () => {
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.reframeTweet)
      .mockResolvedValueOnce({
        ...mockReframeResponse,
        reply: validSource,
        tokensIn: 30,
        tokensOut: 40,
      })
      .mockResolvedValueOnce({
        ...mockReframeResponse,
        reply: 'A completely fresh take on why TypeScript still matters for web teams.',
        tokensIn: 35,
        tokensOut: 45,
      });

    await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 75 });

    const { storage } = await import('../../../server/storage');
    const tokensCall = vi.mocked(storage.createReplyTokens).mock.calls[0]?.[0];
    expect(tokensCall?.stageBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'reframe_generation' }),
        expect.objectContaining({ stage: 'reframe_generation_retry' }),
      ]),
    );
    expect(tokensCall?.totalPromptTokens).toBe(65);
    expect(tokensCall?.totalCompletionTokens).toBe(85);
  });

  it('returns qualityScore on 0–100 scale from reframe quality checker', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: validSource, degree: 50 });

    expect(res.status).toBe(200);
    expect(res.body.qualityScore).toBeGreaterThanOrEqual(0);
    expect(res.body.qualityScore).toBeLessThanOrEqual(100);
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
    expect(reportRouteErrorMock).toHaveBeenCalled();
    expect(reportRouteErrorMock.mock.calls[0][1]).toMatchObject({
      route: 'POST /api/reframe-tweet',
      userId: 'test-user',
      httpStatus: 500,
    });
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

  it('returns 400 when source_tweet exceeds 2000 without allow_long', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: 'x'.repeat(2001), degree: 50 });

    expectValidationError(res);
  });

  it('accepts source_tweet longer than 2000 when allow_long is true', async () => {
    const longSource = `${'Shipping product with users in the loop. '.repeat(80)}End.`;
    expect(longSource.length).toBeGreaterThan(2000);
    expect(longSource.length).toBeLessThan(25000);

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: longSource, degree: 50, allow_long: true });

    expect(res.status).toBe(200);
    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledWith(
      longSource,
      50,
      expect.objectContaining({ allowLong: true }),
    );
  });

  it('returns 400 when source_tweet exceeds 25000 even with allow_long', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: 'x'.repeat(25001), degree: 50, allow_long: true });

    expectValidationError(res);
  });

  it('retries on collapsed structure when reuse_guidance is absent', async () => {
    const listSource = 'Tips for shipping:\n- Talk to users every week\n- Ship small diffs daily\n- Measure what actually moved';
    const collapsed =
      'Shipping well means talking to customers often, landing tiny diffs, and tracking the metric that actually moved this week instead of vanity counts.';
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.reframeTweet)
      .mockResolvedValueOnce({ ...mockReframeResponse, reply: collapsed })
      .mockResolvedValueOnce({
        ...mockReframeResponse,
        reply: 'Talk to users weekly.\nShip tiny diffs.\nTrack the metric that moved.',
      });

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ source_tweet: listSource, degree: 50 });

    expect(res.status).toBe(200);
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledTimes(2);
  });

  it('does not structure-retry collapsed output when reuse_guidance is set', async () => {
    const listSource = 'Tips for shipping:\n- Talk to users every week\n- Ship small diffs daily\n- Measure what actually moved';
    const collapsed =
      'Shipping well means talking to customers often, landing tiny diffs, and tracking the metric that actually moved this week instead of vanity counts.';
    const { aiRouter } = await import('../../../server/services/ai-router');
    vi.mocked(aiRouter.reframeTweet).mockResolvedValueOnce({
      ...mockReframeResponse,
      reply: collapsed,
    });

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source_tweet: listSource,
        degree: 50,
        reuse_guidance: 'Keep it as one paragraph',
      });

    expect(res.status).toBe(200);
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledTimes(1);
    expect(res.body.reframed).toBe(collapsed);
  });

  it('forwards reuse_guidance to aiRouter.reframeTweet', async () => {
    await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source_tweet: validSource,
        degree: 50,
        reuse_guidance: 'Make it shorter and more casual',
      });

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).toHaveBeenCalledWith(
      validSource,
      50,
      expect.objectContaining({ reuseGuidance: 'Make it shorter and more casual' }),
    );
  });

  it('returns 400 when reuse_guidance exceeds 300 characters', async () => {
    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source_tweet: validSource,
        degree: 50,
        reuse_guidance: 'x'.repeat(301),
      });

    expectValidationError(res);
  });

  it('passes combined source and guidance to runGuardrail', async () => {
    const { runGuardrail } = await import('../../../server/services/guardrail');

    await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source_tweet: validSource,
        degree: 50,
        reuse_guidance: 'Keep the list format',
      });

    expect(vi.mocked(runGuardrail)).toHaveBeenCalledWith(
      expect.stringContaining(`Source tweet: ${validSource}`),
    );
    expect(vi.mocked(runGuardrail)).toHaveBeenCalledWith(
      expect.stringContaining('Reuse guidance: Keep the list format'),
    );
  });

  it('guardrail violation on toxic guidance blocks reframe generation', async () => {
    const { runGuardrail, generateGuardrailFriendlyReply } = await import(
      '../../../server/services/guardrail'
    );
    vi.mocked(runGuardrail).mockResolvedValueOnce({
      violation: 1,
      category: 'harassment',
      rationale: 'guidance not allowed',
    } as any);
    vi.mocked(generateGuardrailFriendlyReply).mockResolvedValueOnce({
      reply: 'I cannot help with that guidance.',
      modelKey: 'gpt-4o-mini',
      tokensIn: 10,
      tokensOut: 12,
      latencyMs: 150,
    } as any);

    const res = await app
      .raw()
      .post('/api/reframe-tweet')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        source_tweet: validSource,
        degree: 50,
        reuse_guidance: 'Say something hateful',
      });

    expectJsonResponse(res, 200);
    expect(res.body.meta.safetyOutcome).toBe('violation_friendly_reply');
    expect(vi.mocked(generateGuardrailFriendlyReply)).toHaveBeenCalledWith(
      expect.stringContaining('Reuse guidance: Say something hateful'),
      'guidance not allowed',
    );

    const { aiRouter } = await import('../../../server/services/ai-router');
    expect(vi.mocked(aiRouter.reframeTweet)).not.toHaveBeenCalled();
  });
});
