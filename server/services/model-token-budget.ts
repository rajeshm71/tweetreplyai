import { resolveProviderForModel } from '../config/model-catalog.js';
import {
  getModelRoutingConfig,
  isModelRoutingEnabled,
  resolveTierForModel,
  type ModelRoutingTier,
  type ModelRoutingTierId,
} from '../config/model-routing.js';
import { storage } from '../storage.js';
import type { NormalizedTokenUsage } from '../utils/token-usage.js';

export function getDailyWindowKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Returns tokens used today, or `null` when the budget store is unreachable.
 * Review fix: null means "skip this tier" so cascade falls through to Groq (plan §237).
 */
export async function getTierUsageToday(tierId: ModelRoutingTierId): Promise<number | null> {
  const windowKey = getDailyWindowKey();
  try {
    const row = await storage.getPlatformTokenUsage(tierId, windowKey);
    return row?.tokensUsed ?? 0;
  } catch (error) {
    console.error(`[ModelTokenBudget] Failed to read usage for ${tierId}:`, error);
    return null;
  }
}

export function isTierExhausted(tier: ModelRoutingTier, tokensUsed: number): boolean {
  if (tier.dailyTokenLimit === null) return false;
  return tokensUsed >= tier.dailyTokenLimit;
}

export function isTierProviderAvailable(tier: ModelRoutingTier): boolean {
  if (tier.provider === 'openai') return !!process.env.OPENAI_API_KEY;
  if (tier.provider === 'groq') return !!process.env.GROQ_API_KEY;
  return false;
}

/** Review fix (plan §J): explicit model picks fall through when their tier is exhausted. */
function tierSliceFromStart(tiers: ModelRoutingTier[], startTier: ModelRoutingTier): ModelRoutingTier[] {
  const startIdx = tiers.findIndex((t) => t.id === startTier.id);
  if (startIdx < 0) return [startTier];
  // First entry uses startTier so explicit model picks keep the requested model key.
  return [startTier, ...tiers.slice(startIdx + 1)];
}

export async function resolveModelForAutoRequest(): Promise<ModelRoutingTier | null> {
  if (!isModelRoutingEnabled()) return null;

  const tiers = getModelRoutingConfig();
  for (const tier of tiers) {
    if (!isTierProviderAvailable(tier)) continue;
    const used = await getTierUsageToday(tier.id);
    if (used === null) {
      console.log(`[ModelTokenBudget] Budget read failed for ${tier.id}; skipping tier`);
      continue;
    }
    if (!isTierExhausted(tier, used)) {
      return tier;
    }
    console.log(`[ModelTokenBudget] Tier ${tier.id} exhausted (${used}/${tier.dailyTokenLimit ?? '∞'}), skipping`);
  }

  const tertiary = tiers.find((t) => t.id === 'tertiary');
  if (tertiary && isTierProviderAvailable(tertiary)) {
    return tertiary;
  }
  return null;
}

export async function recordTierTokenUsage(
  tierId: ModelRoutingTierId,
  usage: NormalizedTokenUsage,
): Promise<number | null> {
  // Only capped OpenAI tiers affect daily budget accounting.
  if (tierId === 'tertiary') {
    return null;
  }

  const windowKey = getDailyWindowKey();
  try {
    const newTotal = await storage.incrementPlatformTokenUsage(tierId, windowKey, usage);
    console.log(`[ModelTokenBudget] Recorded ${usage.totalTokens} tokens for ${tierId} (${windowKey}); total=${newTotal}`);
    return newTotal;
  } catch (error) {
    console.error(`[ModelTokenBudget] Failed to record usage for ${tierId}:`, error);
    return null;
  }
}

export function resolveTierForExplicitModel(modelKey: string): ModelRoutingTier | null {
  const tierId = resolveTierForModel(modelKey);
  if (!tierId) return null;
  const baseTier = getModelRoutingConfig().find((t) => t.id === tierId);
  if (!baseTier) return null;
  return { ...baseTier, model: modelKey };
}

export async function buildTierAttemptOrder(modelPreference?: string | null): Promise<ModelRoutingTier[]> {
  const tiers = getModelRoutingConfig().filter(isTierProviderAvailable);

  if (!isModelRoutingEnabled()) {
    return tiers;
  }

  if (modelPreference && !['auto', '', 'gpt-4o-mini'].includes(modelPreference)) {
    const explicit = resolveTierForExplicitModel(modelPreference);
    if (explicit) {
      // Review fix: whitelist picks start at requested tier but may fall through on budget exhaustion.
      return tierSliceFromStart(tiers, explicit);
    }
    const provider = resolveProviderForModel(modelPreference) ?? 'openai';
    const tierId = resolveTierForModel(modelPreference);
    return [{
      id: tierId ?? (provider === 'openai' ? 'secondary' : 'tertiary'),
      model: modelPreference,
      provider,
      dailyTokenLimit: tierId === 'tertiary' ? null : getModelRoutingConfig().find((t) => t.id === tierId)?.dailyTokenLimit ?? null,
    }];
  }

  const startTier = await resolveModelForAutoRequest();
  if (!startTier) return tiers;

  return tierSliceFromStart(tiers, startTier);
}

