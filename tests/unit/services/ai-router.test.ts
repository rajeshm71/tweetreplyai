import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedAIRouter } from '../../../server/services/ai-router';
import { AI_MODELS } from '../../../server/config/constants';

vi.mock('../../../server/services/openai', () => ({
  modelRouter: {
    generateReply: vi.fn(),
    improveDraft: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'gpt-4o-mini', name: 'gpt-4o-mini', inputCost: 0.15, outputCost: 0.6, contextWindow: 128000, description: 'Cost-effective fallback model' },
    ]),
  },
}));

vi.mock('../../../server/services/groq', () => ({
  groqModelRouter: {
    generateReply: vi.fn(),
    improveDraft: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout 17B', inputCost: 0.1, outputCost: 0.4, contextWindow: 16384, description: 'Latest Llama 4 Scout model' },
    ]),
  },
}));

describe('AI Router Service - Unit Tests', () => {
  let aiRouter: UnifiedAIRouter;

  beforeEach(() => {
    vi.clearAllMocks();
    aiRouter = new UnifiedAIRouter();
  });

  describe('getModelsByProvider', () => {
    it('should return models grouped by provider', () => {
      const models = aiRouter.getModelsByProvider();
      
      expect(models).toHaveProperty('openai');
      expect(models).toHaveProperty('groq');
      expect(Array.isArray(models.openai)).toBe(true);
      expect(Array.isArray(models.groq)).toBe(true);
    });

    it('should include expected OpenAI models', () => {
      const models = aiRouter.getModelsByProvider();
      
      expect(models.openai).toHaveLength(1);
      expect(models.openai[0]).toHaveProperty('key', 'gpt-4o-mini');
    });

    it('should include expected Groq models', () => {
      const models = aiRouter.getModelsByProvider();
      
      expect(models.groq).toHaveLength(1);
      expect(models.groq[0]).toHaveProperty('key', 'meta-llama/llama-4-scout-17b-16e-instruct');
    });
  });

  describe('generateReply', () => {
    it('should generate reply using OpenAI when modelKey is OpenAI', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        // Use a modelPreference other than the router's FALLBACK constant,
        // so `UnifiedAIRouter.generateReply` doesn't switch to the primary DEFAULT model.
        modelPreference: 'gpt-4o',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply from OpenAI',
        modelKey: 'gpt-4o',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 1000,
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(modelRouter.generateReply).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual(mockResponse);
    });

    it('should default to Llama Scout when modelKey is not specified', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply from Groq',
        modelKey: 'meta-llama/llama-4-scout-17b-16e-instruct',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 500,
      };

      const { groqModelRouter } = await import('../../../server/services/groq');
      vi.mocked(groqModelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(groqModelRouter.generateReply).toHaveBeenCalledWith({
        ...mockRequest,
        modelPreference: 'meta-llama/llama-4-scout-17b-16e-instruct',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should fallback to gpt-4o-mini when Groq fails', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        promptVariation: 'professional',
      };
      const fallbackResponse = {
        reply: 'Fallback reply from OpenAI',
        modelKey: 'gpt-4o-mini',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 1000,
      };

      const { groqModelRouter } = await import('../../../server/services/groq');
      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(groqModelRouter.generateReply).mockRejectedValue(new Error('Groq API error'));
      vi.mocked(modelRouter.generateReply).mockResolvedValue(fallbackResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(result).toEqual(fallbackResponse);
    });

    it('should handle OpenAI errors without fallback', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-4o-mini',
        promptVariation: 'professional',
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockRejectedValue(new Error('OpenAI API error'));

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow('OpenAI API error');
    });

    // Unknown modelKey hits switch default → throw → catch → FALLBACK to OpenAI with AI_MODELS.FALLBACK.
    // This test asserts that fallback path is invoked; rejection is from the mocked fallback call, not the initial throw.
    it('rejects when unknown modelPreference triggers FALLBACK and OpenAI generateReply fails', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'unknown-model',
        promptVariation: 'professional',
      };

      const { modelRouter } = await import('../../../server/services/openai');
      const fallbackError = new Error('Fallback OpenAI failed');
      vi.mocked(modelRouter.generateReply).mockRejectedValue(fallbackError);

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow('Fallback OpenAI failed');

      expect(modelRouter.generateReply).toHaveBeenCalledTimes(1);
      expect(modelRouter.generateReply).toHaveBeenCalledWith(
        expect.objectContaining({
          modelPreference: AI_MODELS.FALLBACK,
          tweetText: mockRequest.tweetText,
          promptVariation: mockRequest.promptVariation,
        })
      );
    });

    it('should track token counting correctly', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-4o-mini',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply',
        modelKey: 'gpt-4o-mini',
        tokensIn: 15,
        tokensOut: 20,
        latencyMs: 1500,
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(result.tokensIn).toBe(15);
      expect(result.tokensOut).toBe(20);
    });

    it('should track latency correctly', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-4o-mini',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply',
        modelKey: 'gpt-4o-mini',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 2000,
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(result.latencyMs).toBe(2000);
    });
  });

  describe('improveDraft', () => {
    it('routes improveDraft to groq when modelKey is a Llama model', async () => {
      const { groqModelRouter } = await import('../../../server/services/groq');
      const mockResponse = { reply: 'Improved by Groq', modelKey: 'meta-llama/llama-4-scout-17b-16e-instruct', tokensIn: 5, tokensOut: 10, latencyMs: 100 };
      vi.mocked(groqModelRouter.improveDraft).mockResolvedValue(mockResponse);

      const result = await aiRouter.improveDraft('tweet text', 'draft reply', 'meta-llama/llama-4-scout-17b-16e-instruct');

      expect(groqModelRouter.improveDraft).toHaveBeenCalledWith('tweet text', 'draft reply', 'meta-llama/llama-4-scout-17b-16e-instruct');
      expect(result.reply).toBe('Improved by Groq');
    });

    it('routes improveDraft to openai when modelKey is a GPT model', async () => {
      const { modelRouter } = await import('../../../server/services/openai');
      const mockResponse = { reply: 'Improved by OpenAI', modelKey: 'gpt-4o-mini', tokensIn: 5, tokensOut: 10, latencyMs: 200 };
      vi.mocked(modelRouter.improveDraft).mockResolvedValue(mockResponse);

      const result = await aiRouter.improveDraft('tweet text', 'draft reply', 'gpt-4o-mini');

      expect(modelRouter.improveDraft).toHaveBeenCalledWith('tweet text', 'draft reply', 'gpt-4o-mini');
      expect(result.reply).toBe('Improved by OpenAI');
    });

    it('defaults to groq when no modelPreference provided for improveDraft (AI_MODELS.DEFAULT is Llama)', async () => {
      const { groqModelRouter } = await import('../../../server/services/groq');
      vi.mocked(groqModelRouter.improveDraft).mockResolvedValue({ reply: 'Default improved', modelKey: 'meta-llama/llama-4-scout-17b-16e-instruct', tokensIn: 5, tokensOut: 10, latencyMs: 200 });

      await aiRouter.improveDraft('tweet text', 'draft reply');

      expect(groqModelRouter.improveDraft).toHaveBeenCalled();
    });
  });

  describe('getModelInfo', () => {
    it('returns model info for a known OpenAI model key', () => {
      const info = aiRouter.getModelInfo('gpt-4o-mini');
      expect(info).not.toBeNull();
      expect(info!.key).toBe('gpt-4o-mini');
      expect(info!.provider).toBe('openai');
    });

    it('returns model info for a known Groq model key', () => {
      const info = aiRouter.getModelInfo('meta-llama/llama-4-scout-17b-16e-instruct');
      expect(info).not.toBeNull();
      expect(info!.provider).toBe('groq');
    });

    it('returns guardrail model info for the GUARDRAIL model key', async () => {
      const { AI_MODELS } = await import('../../../server/config/constants');
      const info = aiRouter.getModelInfo(AI_MODELS.GUARDRAIL);
      expect(info).not.toBeNull();
      expect(info!.key).toBe(AI_MODELS.GUARDRAIL);
      expect(info!.provider).toBe('groq');
    });

    it('returns null for an unknown model key', () => {
      const info = aiRouter.getModelInfo('unknown-model-xyz');
      expect(info).toBeNull();
    });
  });

  describe('estimateCost', () => {
    it('returns a non-negative cost for a known model', () => {
      const cost = aiRouter.estimateCost('gpt-4o-mini', 1000, 500);
      expect(cost).toBeGreaterThanOrEqual(0);
      expect(typeof cost).toBe('number');
    });

    it('returns 0 for an unknown model key', () => {
      const cost = aiRouter.estimateCost('unknown-model', 1000, 500);
      expect(cost).toBe(0);
    });

    it('returns 0 when token counts are 0', () => {
      const cost = aiRouter.estimateCost('gpt-4o-mini', 0, 0);
      expect(cost).toBe(0);
    });
  });

  describe('getRecommendedModel', () => {
    it('returns a non-empty string model key', () => {
      const model = aiRouter.getRecommendedModel();
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });
});
