import { describe, it, expect } from 'vitest';
import {
  normalizeOpenAIUsage,
  normalizeGroqUsage,
  normalizeTokenUsage,
  stageBreakdownFromReply,
  usageFromReplyResponse,
} from '../../../server/utils/token-usage';

describe('token-usage normalizer', () => {
  it('uses OpenAI total_tokens when present', () => {
    const result = normalizeOpenAIUsage({
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 175,
      input_tokens_details: { cached_tokens: 10 },
      output_tokens_details: { reasoning_tokens: 15 },
    });
    expect(result?.totalTokens).toBe(175);
    expect(result?.cachedTokens).toBe(10);
    expect(result?.reasoningTokens).toBe(15);
    expect(result?.source).toBe('api');
  });

  it('sums groq prompt and completion tokens', () => {
    const result = normalizeGroqUsage({ prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 });
    expect(result?.totalTokens).toBe(100);
    expect(result?.inputTokens).toBe(80);
    expect(result?.outputTokens).toBe(20);
  });

  it('falls back to char estimate for OpenAI when usage missing', () => {
    const result = normalizeTokenUsage('openai', null, 'abcd');
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(['tiktoken_estimate', 'char_estimate']).toContain(result.source);
  });

  it('prefers OpenAI total_tokens over input+output sum', () => {
    const usage = usageFromReplyResponse('openai', 100, 50, {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 175,
    });
    expect(usage.totalTokens).toBe(175);
  });

  it('stageBreakdownFromReply aligns with normalizer', () => {
    const stage = stageBreakdownFromReply({
      modelKey: 'gpt-5-chat-latest',
      tokensIn: 10,
      tokensOut: 5,
      rawUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 20 },
    });
    expect(stage.totalTokens).toBe(20);
    expect(stage.promptTokens).toBe(10);
    expect(stage.completionTokens).toBe(5);
  });
});
