/**
 * Configurable 3-tier model cascade for auto (budget-routed) generation.
 * All values overridable via environment variables.
 */
import { resolveTierIdForModel } from './model-catalog.js';

export type ModelRoutingTierId = 'primary' | 'secondary' | 'tertiary';
export type ModelRoutingProvider = 'openai' | 'groq';

export interface ModelRoutingTier {
  id: ModelRoutingTierId;
  model: string;
  provider: ModelRoutingProvider;
  dailyTokenLimit: number | null;
}

const DEFAULT_TIER1_MODEL = 'gpt-5-chat-latest';
const DEFAULT_TIER2_MODEL = 'gpt-5.4-mini';
const DEFAULT_TIER3_MODEL = 'openai/gpt-oss-120b';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value !== 'false' && value !== '0';
}

export function isModelRoutingEnabled(): boolean {
  return parseBool(process.env.MODEL_ROUTING_ENABLED, true);
}

export function getModelRoutingConfig(): ModelRoutingTier[] {
  return [
    {
      id: 'primary',
      model: process.env.MODEL_ROUTING_TIER1_MODEL?.trim() || DEFAULT_TIER1_MODEL,
      provider: 'openai',
      dailyTokenLimit: parsePositiveInt(process.env.MODEL_ROUTING_TIER1_DAILY_TOKENS, 250_000),
    },
    {
      id: 'secondary',
      model: process.env.MODEL_ROUTING_TIER2_MODEL?.trim() || DEFAULT_TIER2_MODEL,
      provider: 'openai',
      dailyTokenLimit: parsePositiveInt(process.env.MODEL_ROUTING_TIER2_DAILY_TOKENS, 2_500_000),
    },
    {
      id: 'tertiary',
      model: process.env.MODEL_ROUTING_TIER3_MODEL?.trim() || DEFAULT_TIER3_MODEL,
      provider: 'groq',
      dailyTokenLimit: null,
    },
  ];
}

export function getGroqTertiaryModel(): string {
  const tertiary = getModelRoutingConfig().find((t) => t.id === 'tertiary');
  return tertiary?.model || DEFAULT_TIER3_MODEL;
}

/** Legacy auto aliases that should use the budget cascade. */
export const AUTO_MODEL_ALIASES = new Set(['auto', '', 'gpt-4o-mini']);

export function isAutoModelPreference(modelPreference?: string | null): boolean {
  if (!modelPreference) return true;
  return AUTO_MODEL_ALIASES.has(modelPreference);
}

export function resolveTierForModel(modelKey: string): ModelRoutingTierId | null {
  return resolveTierIdForModel(modelKey);
}

export function logModelRoutingConfigAtStartup(): void {
  if (!isModelRoutingEnabled()) {
    console.log('[ModelRouting] Disabled (MODEL_ROUTING_ENABLED=false); using legacy Groq-first routing');
    return;
  }
  const tiers = getModelRoutingConfig();
  console.log('[ModelRouting] Enabled — tier cascade:');
  for (const t of tiers) {
    const cap = t.dailyTokenLimit === null ? 'unlimited' : `${t.dailyTokenLimit}/day`;
    console.log(`  ${t.id}: ${t.model} (${t.provider}, ${cap})`);
  }
}
