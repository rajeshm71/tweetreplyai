import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedAIRouter } from '../../../server/services/ai-router';

vi.mock('../../../server/services/openai', () => ({
  modelRouter: {
    generateReply: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'gpt-4o-mini', name: 'gpt-4o-mini', inputCost: 0.15, outputCost: 0.6, contextWindow: 128000, description: 'Cost-effective fallback model' },
    ]),
  },
}));

vi.mock('../../../server/services/groq', () => ({
  groqModelRouter: {
    generateReply: vi.fn(),
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
        modelPreference: 'gpt-4o-mini',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply from OpenAI',
        modelKey: 'gpt-4o-mini',
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

    it('should throw error for unknown model', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'unknown-model',
        promptVariation: 'professional',
      };

      const { modelRouter } = await import('../../../server/services/openai');
      vi.mocked(modelRouter.generateReply).mockRejectedValue(new Error('Unknown model: unknown-model'));

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow();
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
});
