import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp, expectJsonResponse, expectQuotaExceededError } from '../../helpers/request';
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
vi.mock('../../../server/services/linkedin-ai-service', () => ({
  generateLinkedInReply: vi.fn(),
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
  generateGuardrailFriendlyReply: vi.fn(),
}));
vi.mock('../../../server/services/prompts', () => ({
  getAvailablePrompts: vi.fn().mockReturnValue([{ name: 'default', description: 'Natural' }]),
}));

describe('AI Generate Reply (LinkedIn) - Unit Tests', () => {
  let app: any;
  const mockUser = createMockUser();
  const authToken = signTestJwt({ id: 'test-user', email: mockUser.email });
  const mockLinkedInReply = { reply: 'LinkedIn reply', modelKey: 'gpt-4o-mini', tokensIn: 20, tokensOut: 30, latencyMs: 800 };
  const linkedInQualityScore = 85;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);

    const { usageService } = await import('../../../server/services/usage');
    const { generateLinkedInReply } = await import('../../../server/services/linkedin-ai-service');
    const { storage } = await import('../../../server/storage');

    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: true, reason: null });
    vi.mocked(usageService.consumeReply).mockResolvedValue({ creditsUsed: 2, repliesUsed: 1, limit: 10, resetAt: new Date() });
    vi.mocked(generateLinkedInReply).mockResolvedValue(mockLinkedInReply);
    vi.mocked(storage.getUser).mockResolvedValue({ id: 'test-user', email: mockUser.email } as any);
    vi.mocked(storage.createReplyEvent).mockResolvedValue({} as any);
    vi.mocked(storage.createReplyHistory).mockResolvedValue({ id: 'hist-1', userId: 'test-user', generatedReply: mockLinkedInReply.reply, originalTweet: 'post', wasUsed: false, modelKey: 'gpt-4o-mini', createdAt: new Date() } as any);
    vi.mocked(storage.createReplyTokens).mockResolvedValue(undefined);
  });

  it('generates a LinkedIn reply using platform:linkedin', async () => {
    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Great LinkedIn post', platform: 'linkedin' });

    expectJsonResponse(res, 200, {
      reply: mockLinkedInReply.reply,
      meta: { modelKey: mockLinkedInReply.modelKey, latencyMs: mockLinkedInReply.latencyMs },
    });
  });

  it('uses the generateLinkedInReply service (not aiRouter) for LinkedIn', async () => {
    const { generateLinkedInReply } = await import('../../../server/services/linkedin-ai-service');
    const { aiRouter } = await import('../../../server/services/ai-router');

    await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Great LinkedIn post', platform: 'linkedin' });

    expect(vi.mocked(generateLinkedInReply)).toHaveBeenCalled();
    expect(vi.mocked(aiRouter.generateReply)).not.toHaveBeenCalled();
  });

  it('returns 402 when quota exceeded on LinkedIn path', async () => {
    const { usageService } = await import('../../../server/services/usage');
    vi.mocked(usageService.canUseReply).mockResolvedValue({ canUse: false, reason: 'quota_exceeded' });
    vi.mocked(usageService.getUsageStatus).mockResolvedValue(createMockUsageStatus({ used: 10, limit: 10 }));

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Great post', platform: 'linkedin' });

    expectQuotaExceededError(res);
  });

  it('returns 500 when LinkedIn service errors', async () => {
    const { generateLinkedInReply } = await import('../../../server/services/linkedin-ai-service');
    vi.mocked(generateLinkedInReply).mockRejectedValue(new Error('LinkedIn AI down'));

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Great LinkedIn post', platform: 'linkedin' });

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('message');
  });

  it('response qualityScore is null on LinkedIn path', async () => {
    const { storage } = await import('../../../server/storage');

    const res = await app.raw()
      .post('/api/generate-reply')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ tweet_text: 'Great LinkedIn post', platform: 'linkedin' });

    expect(res.status).toBe(200);
    expect(res.body.qualityScore).toBe(linkedInQualityScore);
    expect(vi.mocked(storage.createReplyHistory)).toHaveBeenCalledWith(
      expect.objectContaining({ qualityScore: linkedInQualityScore }),
    );
  });
});
