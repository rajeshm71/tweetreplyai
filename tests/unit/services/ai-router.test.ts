import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedAIRouter } from '../../../server/services/ai-router';
import { AI_MODELS } from '../../../server/config/constants';

vi.mock('../../../server/services/model-token-budget', () => ({
  buildTierAttemptOrder: vi.fn(),
  getTierUsageToday: vi.fn().mockResolvedValue(0),
  isTierExhausted: vi.fn().mockReturnValue(false),
  isTierProviderAvailable: vi.fn().mockReturnValue(true),
  recordTierTokenUsage: vi.fn().mockResolvedValue(100),
}));

vi.mock('../../../server/services/openai', () => ({
  modelRouter: {
    generateReply: vi.fn(),
    improveDraft: vi.fn(),
    reframeTweet: vi.fn(),
    generateChatCompletion: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'gpt-5-chat-latest', name: 'GPT-5 Chat Latest', inputCost: 2.5, outputCost: 15, contextWindow: 128000, description: 'Primary' },
      { key: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', inputCost: 0.375, outputCost: 2.25, contextWindow: 400000, description: 'Secondary' },
      { key: 'gpt-4o-mini', name: 'Legacy', inputCost: 0.15, outputCost: 0.6, contextWindow: 128000, description: 'Legacy' },
    ]),
  },
}));

vi.mock('../../../server/services/groq', () => ({
  groqModelRouter: {
    generateReply: vi.fn(),
    improveDraft: vi.fn(),
    reframeTweet: vi.fn(),
    generateChatCompletion: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'openai/gpt-oss-120b', name: 'GPT-OSS 120B', inputCost: 0.1, outputCost: 0.4, contextWindow: 131072, description: 'Tertiary' },
    ]),
  },
}));

const primaryTier = { id: 'primary' as const, model: 'gpt-5-chat-latest', provider: 'openai' as const, dailyTokenLimit: 250_000 };
const secondaryTier = { id: 'secondary' as const, model: 'gpt-5.4-mini', provider: 'openai' as const, dailyTokenLimit: 2_500_000 };
const tertiaryTier = { id: 'tertiary' as const, model: 'openai/gpt-oss-120b', provider: 'groq' as const, dailyTokenLimit: null };

describe('AI Router Service - Unit Tests', () => {
  let aiRouter: UnifiedAIRouter;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.MODEL_ROUTING_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test';
    process.env.GROQ_API_KEY = 'test';
    aiRouter = new UnifiedAIRouter();

    const budget = await import('../../../server/services/model-token-budget');
    vi.mocked(budget.getTierUsageToday).mockResolvedValue(0);
    vi.mocked(budget.isTierExhausted).mockReturnValue(false);
    vi.mocked(budget.buildTierAttemptOrder).mockResolvedValue([
      primaryTier,
      secondaryTier,
      tertiaryTier,
    ]);
  });

  describe('cascade routing', () => {
    it('explicit tier-1 falls through when primary budget exhausted', async () => {
      const { buildTierAttemptOrder, getTierUsageToday, isTierExhausted } = await import(
        '../../../server/services/model-token-budget'
      );
      vi.mocked(buildTierAttemptOrder).mockResolvedValue([
        primaryTier,
        secondaryTier,
        tertiaryTier,
      ]);
      vi.mocked(getTierUsageToday).mockImplementation(async (tierId) => {
        if (tierId === 'primary') return 250_000;
        return 0;
      });
      vi.mocked(isTierExhausted).mockImplementation(
        (tier, used) => tier.dailyTokenLimit !== null && used >= tier.dailyTokenLimit,
      );

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue({
        reply: 'Secondary after explicit budget skip',
        modelKey: 'gpt-5.4-mini',
        tokensIn: 5,
        tokensOut: 5,
        latencyMs: 50,
      });

      const result = await aiRouter.generateReply({
        tweetText: 'hello',
        modelPreference: 'gpt-5-chat-latest',
      });

      expect(result.tierId).toBe('secondary');
      expect(modelRouter.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({ modelPreference: 'gpt-5.4-mini' }),
      );
    });

    it('preserves response modelKey for explicit tier-2 pick', async () => {
      const explicitTier2 = {
        id: 'secondary' as const,
        model: 'gpt-4.1-mini',
        provider: 'openai' as const,
        dailyTokenLimit: 2_500_000,
      };
      const { buildTierAttemptOrder } = await import('../../../server/services/model-token-budget');
      vi.mocked(buildTierAttemptOrder).mockResolvedValue([explicitTier2]);

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue({
        reply: 'Tier-2 explicit',
        modelKey: 'gpt-4.1-mini',
        tokensIn: 5,
        tokensOut: 5,
        latencyMs: 40,
      });

      const result = await aiRouter.generateReply({
        tweetText: 'hello',
        modelPreference: 'gpt-4.1-mini',
      });

      expect(result.modelKey).toBe('gpt-4.1-mini');
      expect(modelRouter.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({ modelPreference: 'gpt-4.1-mini' }),
      );
    });

    it('uses primary tier for auto requests', async () => {
      const { buildTierAttemptOrder } = await import('../../../server/services/model-token-budget');
      vi.mocked(buildTierAttemptOrder).mockResolvedValue([primaryTier, secondaryTier, tertiaryTier]);

      const mockResponse = {
        reply: 'Primary reply',
        modelKey: 'gpt-5-chat-latest',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 100,
        rawUsage: { total_tokens: 25 },
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply({ tweetText: 'hello' });

      expect(modelRouter.generateReply).toHaveBeenCalledWith(expect.objectContaining({ modelPreference: 'gpt-5-chat-latest' }));
      expect(result.tierId).toBe('primary');
      expect(result.reply).toBe('Primary reply');
    });

    it('falls back to secondary tier when primary API fails', async () => {
      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply)
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce({
          reply: 'Secondary reply',
          modelKey: 'gpt-5.4-mini',
          tokensIn: 5,
          tokensOut: 5,
          latencyMs: 50,
        });

      const result = await aiRouter.generateReply({ tweetText: 'hello' });

      expect(modelRouter.generateReply).toHaveBeenCalledTimes(2);
      expect(result.tierId).toBe('secondary');
      expect(result.reply).toBe('Secondary reply');
    });

    it('skips demo placeholder and tries next tier', async () => {
      const { buildTierAttemptOrder } = await import('../../../server/services/model-token-budget');
      vi.mocked(buildTierAttemptOrder).mockResolvedValue([primaryTier, tertiaryTier]);

      const { modelRouter } = await import('../../../server/services/openai');
      const { groqModelRouter } = await import('../../../server/services/groq');
      vi.mocked(modelRouter.generateReply).mockResolvedValueOnce({
        reply: 'demo',
        modelKey: 'demo',
        latencyMs: 1,
      });
      vi.mocked(groqModelRouter.generateReply).mockResolvedValueOnce({
        reply: 'Groq reply',
        modelKey: 'openai/gpt-oss-120b',
        tokensIn: 1,
        tokensOut: 1,
        latencyMs: 2,
      });

      const result = await aiRouter.generateReply({ tweetText: 'hello' });

      expect(groqModelRouter.generateReply).toHaveBeenCalled();
      expect(result.tierId).toBe('tertiary');
    });
  });

  describe('legacy routing when disabled', () => {
    beforeEach(async () => {
      process.env.MODEL_ROUTING_ENABLED = 'false';
      aiRouter = new UnifiedAIRouter();
      const { modelRouter } = await import('../../../server/services/openai');
      const { groqModelRouter } = await import('../../../server/services/groq');
      vi.mocked(modelRouter.generateReply).mockReset();
      vi.mocked(groqModelRouter.generateReply).mockReset();
    });

    it('defaults to groq tertiary when modelKey is not specified', async () => {
      const mockResponse = {
        reply: 'Groq legacy reply',
        modelKey: 'openai/gpt-oss-120b',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 500,
      };

      const { groqModelRouter } = await import('../../../server/services/groq');
      vi.mocked(groqModelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply({ tweetText: 'test', promptVariation: 'professional' });

      expect(groqModelRouter.generateReply).toHaveBeenCalled();
      expect(result).toEqual(mockResponse);
    });

    it('falls back to gpt-4o-mini when groq fails (legacy rollback)', async () => {
      const fallbackResponse = {
        reply: 'Fallback reply',
        modelKey: 'gpt-4o-mini',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 1000,
      };

      const { groqModelRouter } = await import('../../../server/services/groq');
      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(groqModelRouter.generateReply).mockRejectedValue(new Error('Groq API error'));
      vi.mocked(modelRouter.generateReply).mockResolvedValue(fallbackResponse);

      const result = await aiRouter.generateReply({ tweetText: 'test' });

      expect(result).toEqual(fallbackResponse);
    });
  });

  describe('getModelsByProvider', () => {
    it('should return models grouped by provider', () => {
      const models = aiRouter.getModelsByProvider();
      expect(models).toHaveProperty('openai');
      expect(models).toHaveProperty('groq');
      expect(models.openai.some((m) => m.key === 'gpt-5-chat-latest')).toBe(true);
      expect(models.groq.some((m) => m.key === 'openai/gpt-oss-120b')).toBe(true);
    });
  });

  describe('getRecommendedModel', () => {
    it('returns primary model when routing enabled', () => {
      expect(aiRouter.getRecommendedModel()).toBe('gpt-5-chat-latest');
    });

    it('returns groq tertiary when routing disabled', () => {
      process.env.MODEL_ROUTING_ENABLED = 'false';
      aiRouter = new UnifiedAIRouter();
      expect(aiRouter.getRecommendedModel()).toBe('openai/gpt-oss-120b');
    });
  });

  describe('getModelInfo', () => {
    it('returns guardrail model info', async () => {
      const info = aiRouter.getModelInfo(AI_MODELS.GUARDRAIL);
      expect(info?.provider).toBe('groq');
    });
  });
});
