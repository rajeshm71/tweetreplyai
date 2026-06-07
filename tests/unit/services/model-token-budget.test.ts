import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getDailyWindowKey,
  isTierExhausted,
  resolveModelForAutoRequest,
  recordTierTokenUsage,
  buildTierAttemptOrder,
  resolveTierForExplicitModel,
} from '../../../server/services/model-token-budget';

vi.mock('../../../server/storage', () => ({
  storage: {
    getPlatformTokenUsage: vi.fn(),
    incrementPlatformTokenUsage: vi.fn(),
  },
}));

describe('model-token-budget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MODEL_ROUTING_ENABLED = 'true';
    process.env.OPENAI_API_KEY = 'test-openai';
    process.env.GROQ_API_KEY = 'test-groq';
  });

  it('formats UTC daily window key', () => {
    const key = getDailyWindowKey(new Date('2026-05-26T15:00:00Z'));
    expect(key).toBe('2026-05-26');
  });

  it('detects tier exhaustion at cap', () => {
    expect(isTierExhausted({ id: 'primary', model: 'gpt-5-chat-latest', provider: 'openai', dailyTokenLimit: 250_000 }, 250_000)).toBe(true);
    expect(isTierExhausted({ id: 'primary', model: 'gpt-5-chat-latest', provider: 'openai', dailyTokenLimit: 250_000 }, 249_999)).toBe(false);
    expect(isTierExhausted({ id: 'tertiary', model: 'llama', provider: 'groq', dailyTokenLimit: null }, 9_999_999)).toBe(false);
  });

  it('resolves primary tier when under budget', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getPlatformTokenUsage).mockResolvedValue({ tokensUsed: 100 } as any);

    const tier = await resolveModelForAutoRequest();
    expect(tier?.id).toBe('primary');
  });

  it('skips to secondary when primary exhausted', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getPlatformTokenUsage).mockImplementation(async (tierId) => {
      if (tierId === 'primary') return { tokensUsed: 250_000 } as any;
      return { tokensUsed: 0 } as any;
    });

    const tier = await resolveModelForAutoRequest();
    expect(tier?.id).toBe('secondary');
  });

  it('skips tier when budget read fails and resolves to next tier', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getPlatformTokenUsage).mockImplementation(async (tierId) => {
      if (tierId === 'primary') throw new Error('db down');
      if (tierId === 'secondary') return { tokensUsed: 0 } as any;
      return { tokensUsed: 0 } as any;
    });

    const tier = await resolveModelForAutoRequest();
    expect(tier?.id).toBe('secondary');
  });

  it('explicit tier-2 pick uses requested model key not tier default', () => {
    const tier = resolveTierForExplicitModel('gpt-4.1-mini');
    expect(tier?.id).toBe('secondary');
    expect(tier?.model).toBe('gpt-4.1-mini');
  });

  it('explicit tier-2 order starts with requested model', async () => {
    const order = await buildTierAttemptOrder('gpt-4.1-mini');
    expect(order[0]?.model).toBe('gpt-4.1-mini');
    expect(order[0]?.id).toBe('secondary');
  });

  it('explicit model preference falls through tier chain when primary exhausted', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.getPlatformTokenUsage).mockResolvedValue({ tokensUsed: 250_000 } as any);

    const order = await buildTierAttemptOrder('gpt-5-chat-latest');
    expect(order.map((t) => t.id)).toEqual(['primary', 'secondary', 'tertiary']);
  });

  it('does not record tertiary tier to platform budget table', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.incrementPlatformTokenUsage).mockResolvedValue(10);

    const total = await recordTierTokenUsage('tertiary', {
      totalTokens: 50,
      inputTokens: 30,
      outputTokens: 20,
      cachedTokens: 0,
      reasoningTokens: 0,
      source: 'api',
    });

    expect(total).toBeNull();
    expect(storage.incrementPlatformTokenUsage).not.toHaveBeenCalled();
  });

  it('records token usage via storage RPC', async () => {
    const { storage } = await import('../../../server/storage');
    vi.mocked(storage.incrementPlatformTokenUsage).mockResolvedValue(500);

    const total = await recordTierTokenUsage('primary', {
      totalTokens: 120,
      inputTokens: 80,
      outputTokens: 40,
      cachedTokens: 0,
      reasoningTokens: 0,
      source: 'api',
    });

    expect(total).toBe(500);
    expect(storage.incrementPlatformTokenUsage).toHaveBeenCalledWith(
      'primary',
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.objectContaining({ totalTokens: 120 }),
    );
  });
});
