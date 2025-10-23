import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedAIRouter } from '../../../server/services/ai-router';

// Mock the AI services
vi.mock('../../../server/services/openai', () => ({
  modelRouter: {
    generateReply: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', inputCost: 0.0015, outputCost: 0.002, contextWindow: 4096, description: 'Fast and efficient' },
      { key: 'gpt-4', name: 'GPT-4', inputCost: 0.03, outputCost: 0.06, contextWindow: 8192, description: 'Most capable model' },
    ]),
  },
}));

vi.mock('../../../server/services/gemini', () => ({
  geminiModelRouter: {
    generateReply: vi.fn(),
    getAvailableModels: vi.fn().mockReturnValue([
      { key: 'gemini-pro', name: 'Gemini Pro', inputCost: 0.0005, outputCost: 0.0015, contextWindow: 30720, description: 'Google\'s advanced model' },
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
      expect(models).toHaveProperty('gemini');
      expect(Array.isArray(models.openai)).toBe(true);
      expect(Array.isArray(models.gemini)).toBe(true);
    });

    it('should include expected OpenAI models', () => {
      const models = aiRouter.getModelsByProvider();
      
      expect(models.openai).toHaveLength(2);
      expect(models.openai[0]).toHaveProperty('key', 'gpt-3.5-turbo');
      expect(models.openai[1]).toHaveProperty('key', 'gpt-4');
    });

    it('should include expected Gemini models', () => {
      const models = aiRouter.getModelsByProvider();
      
      expect(models.gemini).toHaveLength(1);
      expect(models.gemini[0]).toHaveProperty('key', 'gemini-pro');
    });
  });

  describe('generateReply', () => {
    it('should generate reply using OpenAI when modelKey is OpenAI', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-3.5-turbo',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply from OpenAI',
        modelKey: 'gpt-3.5-turbo',
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

    it('should generate reply using Gemini when modelKey is Gemini', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gemini-pro',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply from Gemini',
        modelKey: 'gemini-pro',
        tokensIn: 10,
        tokensOut: 15,
        latencyMs: 1200,
      };

      const { geminiModelRouter } = await import('../../../server/services/gemini');
      vi.mocked(geminiModelRouter.generateReply).mockResolvedValue(mockResponse);

      const result = await aiRouter.generateReply(mockRequest);

      expect(geminiModelRouter.generateReply).toHaveBeenCalledWith(mockRequest);
      expect(result).toEqual(mockResponse);
    });

    it('should fallback to OpenAI when modelKey is not specified', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
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

      expect(modelRouter.generateReply).toHaveBeenCalledWith({
        ...mockRequest,
        modelPreference: 'gpt-4o-mini',
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle OpenAI errors', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-3.5-turbo',
        promptVariation: 'professional',
      };

      const { modelRouter } = await import('../../../server/services/openai');
      
      vi.mocked(modelRouter.generateReply).mockRejectedValue(new Error('OpenAI API error'));

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow('OpenAI API error');
    });

    it('should handle Gemini errors', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gemini-pro',
        promptVariation: 'professional',
      };

      const { geminiModelRouter } = await import('../../../server/services/gemini');
      
      vi.mocked(geminiModelRouter.generateReply).mockRejectedValue(new Error('Gemini API error'));

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow('Gemini API error');
    });

    it('should throw error for unknown model', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'unknown-model',
        promptVariation: 'professional',
      };

      await expect(aiRouter.generateReply(mockRequest)).rejects.toThrow('Unknown model: unknown-model');
    });

    it('should track token counting correctly', async () => {
      const mockRequest = {
        tweetText: 'This is a test tweet',
        modelPreference: 'gpt-3.5-turbo',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply',
        modelKey: 'gpt-3.5-turbo',
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
        modelPreference: 'gpt-3.5-turbo',
        promptVariation: 'professional',
      };
      const mockResponse = {
        reply: 'This is a test reply',
        modelKey: 'gpt-3.5-turbo',
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