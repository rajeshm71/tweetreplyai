import { beforeEach, describe, expect, it } from 'vitest';
import {
  getTier2ModelKeys,
  resetModelCatalogCache,
  resolveProviderForModel,
  resolveTierIdForModel,
} from '../../../server/config/model-catalog';

describe('model-catalog', () => {
  beforeEach(() => {
    resetModelCatalogCache();
    process.env.MODEL_ROUTING_ENABLED = 'true';
  });

  it('resolves all 8 tier-2 models to secondary', () => {
    const keys = getTier2ModelKeys();
    expect(keys).toHaveLength(8);
    expect(keys).toContain('gpt-5.4-mini');
    expect(keys).toContain('gpt-4.1-mini');
    expect(keys).toContain('gpt-5-mini');
    expect(keys).toContain('codex-mini-latest');
    expect(keys).toContain('o1-mini');
    expect(keys).toContain('o3-mini');
    expect(keys).toContain('o4-mini');
    expect(keys).toContain('gpt-5.1-codex-mini');

    for (const key of keys) {
      expect(resolveTierIdForModel(key)).toBe('secondary');
    }
  });

  it('resolves o1-mini provider as openai not groq', () => {
    expect(resolveProviderForModel('o1-mini')).toBe('openai');
    expect(resolveProviderForModel('codex-mini-latest')).toBe('openai');
  });

  it('resolves tier-1 and tier-3 from routing config', () => {
    expect(resolveTierIdForModel('gpt-5-chat-latest')).toBe('primary');
    expect(resolveTierIdForModel('meta-llama/llama-4-scout-17b-16e-instruct')).toBe('tertiary');
  });
});
