import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import { setupRoutes } from '../../../server/routes';
import { createTestApp, expectJsonResponse } from '../../helpers/request';

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
vi.mock('../../../server/services/prompts', () => ({
  getAvailablePrompts: vi.fn().mockReturnValue([
    { name: 'default', description: 'Natural, casual responses' },
    { name: 'humorous', description: 'Observational wit—one sharp angle tied to a concrete detail in the tweet' },
  ]),
}));

describe('AI Catalog Routes - Unit Tests', () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const expressApp = express();
    expressApp.use(express.json());
    await setupRoutes(expressApp);
    app = createTestApp(expressApp);
  });

  describe('GET /api/models', () => {
    it('returns list of available AI models', async () => {
      const { aiRouter } = await import('../../../server/services/ai-router');
      vi.mocked(aiRouter.getModelsByProvider).mockReturnValue({
        openai: ['gpt-4o-mini'],
        groq: ['meta-llama/llama-4-scout-17b-16e-instruct'],
      });

      const res = await app.raw().get('/api/models');

      expectJsonResponse(res, 200, {
        openai: ['gpt-4o-mini'],
        groq: expect.any(Array),
      });
    });

    it('returns 500 when ai router throws', async () => {
      const { aiRouter } = await import('../../../server/services/ai-router');
      vi.mocked(aiRouter.getModelsByProvider).mockImplementation(() => {
        throw new Error('Service unavailable');
      });

      const res = await app.raw().get('/api/models');

      expectJsonResponse(res, 500, { message: 'Failed to fetch models' });
    });

    it('response contains provider keys', async () => {
      const { aiRouter } = await import('../../../server/services/ai-router');
      vi.mocked(aiRouter.getModelsByProvider).mockReturnValue({ openai: ['gpt-4o-mini'], groq: [] });

      const res = await app.raw().get('/api/models');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('openai');
    });
  });

  describe('GET /api/prompts', () => {
    it('returns available prompt variations', async () => {
      const res = await app.raw().get('/api/prompts');

      expectJsonResponse(res, 200, [
        { name: 'default', description: expect.any(String) },
        { name: 'humorous', description: expect.any(String) },
      ]);
    });

    it('each prompt has name and description fields', async () => {
      const res = await app.raw().get('/api/prompts');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const prompt of res.body) {
        expect(prompt).toHaveProperty('name');
        expect(prompt).toHaveProperty('description');
      }
    });

    it('returns 500 when prompts service throws', async () => {
      const { getAvailablePrompts } = await import('../../../server/services/prompts');
      vi.mocked(getAvailablePrompts).mockImplementationOnce(() => {
        throw new Error('Prompts unavailable');
      });

      const res = await app.raw().get('/api/prompts');

      expectJsonResponse(res, 500, { message: 'Failed to fetch prompts' });
    });
  });
});
