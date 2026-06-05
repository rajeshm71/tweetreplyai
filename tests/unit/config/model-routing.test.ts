import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getModelRoutingConfig,
  getGroqTertiaryModel,
  isAutoModelPreference,
  isModelRoutingEnabled,
} from '../../../server/config/model-routing';

describe('model-routing config', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  it('returns default 3-tier cascade', () => {
    delete process.env.MODEL_ROUTING_TIER1_MODEL;
    const tiers = getModelRoutingConfig();
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toMatchObject({ id: 'primary', model: 'gpt-5-chat-latest', dailyTokenLimit: 250_000 });
    expect(tiers[1]).toMatchObject({ id: 'secondary', model: 'gpt-5.4-mini', dailyTokenLimit: 2_500_000 });
    expect(tiers[2]).toMatchObject({ id: 'tertiary', provider: 'groq', dailyTokenLimit: null });
  });

  it('parses env overrides', () => {
    process.env.MODEL_ROUTING_TIER1_MODEL = 'gpt-chat-latest';
    process.env.MODEL_ROUTING_TIER1_DAILY_TOKENS = '100000';
    process.env.MODEL_ROUTING_TIER2_MODEL = 'gpt-5.4-mini';
    process.env.MODEL_ROUTING_TIER2_DAILY_TOKENS = '500000';
    process.env.MODEL_ROUTING_TIER3_MODEL = 'llama-custom';

    const tiers = getModelRoutingConfig();
    expect(tiers[0].model).toBe('gpt-chat-latest');
    expect(tiers[0].dailyTokenLimit).toBe(100_000);
    expect(tiers[1].dailyTokenLimit).toBe(500_000);
    expect(tiers[2].model).toBe('llama-custom');
  });

  it('respects MODEL_ROUTING_ENABLED=false', () => {
    process.env.MODEL_ROUTING_ENABLED = 'false';
    expect(isModelRoutingEnabled()).toBe(false);
  });

  it('treats auto aliases correctly', () => {
    expect(isAutoModelPreference(undefined)).toBe(true);
    expect(isAutoModelPreference('auto')).toBe(true);
    expect(isAutoModelPreference('gpt-4o-mini')).toBe(true);
    expect(isAutoModelPreference('gpt-5-chat-latest')).toBe(false);
  });

  it('exposes tertiary groq model helper', () => {
    process.env.MODEL_ROUTING_TIER3_MODEL = 'meta-llama/custom';
    expect(getGroqTertiaryModel()).toBe('meta-llama/custom');
  });
});
