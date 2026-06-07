/**
 * Model catalog: tier assignment, whitelist picker entries, and OpenAI API profiles.
 * Self-contained (no import from model-routing.ts) to avoid circular module graphs.
 */
import type { ModelRoutingTierId } from './model-routing.js';

export type ModelApiProfile = 'responses_chat' | 'chat_completions' | 'chat_reasoning';
export type ModelProvider = 'openai' | 'groq';

export interface CatalogModel {
  key: string;
  name: string;
  tierId: ModelRoutingTierId;
  provider: ModelProvider;
  selectableForWhitelist: boolean;
  apiProfile: ModelApiProfile;
  inputCost: number;
  outputCost: number;
  contextWindow: number;
  description: string;
}

export interface SelectableModelEntry {
  key: string;
  name: string;
  tierId: string;
  provider: string;
}

const DEFAULT_TIER1_MODEL = 'gpt-5-chat-latest';
const DEFAULT_TIER3_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function primaryModelFromEnv(): string {
  return process.env.MODEL_ROUTING_TIER1_MODEL?.trim() || DEFAULT_TIER1_MODEL;
}

function tertiaryModelFromEnv(): string {
  return process.env.MODEL_ROUTING_TIER3_MODEL?.trim() || DEFAULT_TIER3_MODEL;
}

const TIER2_POOL: Array<Omit<CatalogModel, 'tierId' | 'selectableForWhitelist'>> = [
  {
    key: 'gpt-5.4-mini',
    name: 'GPT-5.4 Mini',
    provider: 'openai',
    apiProfile: 'responses_chat',
    inputCost: 0.375,
    outputCost: 2.25,
    contextWindow: 400000,
    description: 'Tier-2 — cost-efficient GPT-5.4 mini',
  },
  {
    key: 'gpt-4.1-mini',
    name: 'GPT-4.1 Mini',
    provider: 'openai',
    apiProfile: 'responses_chat',
    inputCost: 0.4,
    outputCost: 1.6,
    contextWindow: 128000,
    description: 'Tier-2 — GPT-4.1 mini',
  },
  {
    key: 'gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'openai',
    apiProfile: 'responses_chat',
    inputCost: 0.25,
    outputCost: 2.0,
    contextWindow: 128000,
    description: 'Tier-2 — GPT-5 mini',
  },
  {
    key: 'codex-mini-latest',
    name: 'Codex Mini Latest',
    provider: 'openai',
    apiProfile: 'chat_completions',
    inputCost: 0.5,
    outputCost: 2.0,
    contextWindow: 128000,
    description: 'Tier-2 — Codex mini (chat completions)',
  },
  {
    key: 'o1-mini',
    name: 'o1 Mini',
    provider: 'openai',
    apiProfile: 'chat_reasoning',
    inputCost: 1.1,
    outputCost: 4.4,
    contextWindow: 128000,
    description: 'Tier-2 — reasoning mini',
  },
  {
    key: 'o3-mini',
    name: 'o3 Mini',
    provider: 'openai',
    apiProfile: 'chat_reasoning',
    inputCost: 1.1,
    outputCost: 4.4,
    contextWindow: 128000,
    description: 'Tier-2 — reasoning mini',
  },
  {
    key: 'o4-mini',
    name: 'o4 Mini',
    provider: 'openai',
    apiProfile: 'chat_reasoning',
    inputCost: 1.1,
    outputCost: 4.4,
    contextWindow: 128000,
    description: 'Tier-2 — reasoning mini',
  },
  {
    key: 'gpt-5.1-codex-mini',
    name: 'GPT-5.1 Codex Mini',
    provider: 'openai',
    apiProfile: 'chat_completions',
    inputCost: 0.5,
    outputCost: 2.0,
    contextWindow: 128000,
    description: 'Tier-2 — GPT-5.1 Codex mini',
  },
];

function buildCatalog(): CatalogModel[] {
  const tier2: CatalogModel[] = TIER2_POOL.map((m) => ({
    ...m,
    tierId: 'secondary',
    selectableForWhitelist: true,
  }));

  const primaryKey = primaryModelFromEnv();
  const tertiaryKey = tertiaryModelFromEnv();

  const primary: CatalogModel = {
    key: primaryKey,
    name: 'GPT-5 Chat Latest',
    tierId: 'primary',
    provider: 'openai',
    selectableForWhitelist: true,
    apiProfile: 'responses_chat',
    inputCost: 2.5,
    outputCost: 15,
    contextWindow: 128000,
    description: 'Tier-1 — primary cascade model',
  };

  const tertiary: CatalogModel = {
    key: tertiaryKey,
    name: 'Llama 4 Scout 17B',
    tierId: 'tertiary',
    provider: 'groq',
    selectableForWhitelist: true,
    apiProfile: 'responses_chat',
    inputCost: 0.11,
    outputCost: 0.34,
    contextWindow: 131072,
    description: 'Tier-3 — Groq fallback',
  };

  const all = [primary, ...tier2, tertiary];
  const seen = new Set<string>();
  return all.filter((m) => {
    if (seen.has(m.key)) return false;
    seen.add(m.key);
    return true;
  });
}

let cachedCatalog: CatalogModel[] | null = null;

export function getModelCatalog(): CatalogModel[] {
  if (!cachedCatalog) {
    cachedCatalog = buildCatalog();
  }
  return cachedCatalog;
}

export function resetModelCatalogCache(): void {
  cachedCatalog = null;
}

export function getCatalogModel(key: string): CatalogModel | null {
  return getModelCatalog().find((m) => m.key === key) ?? null;
}

export function isCatalogModel(key: string): boolean {
  return getCatalogModel(key) !== null;
}

export function resolveTierIdForModel(modelKey: string): ModelRoutingTierId | null {
  const catalog = getCatalogModel(modelKey);
  if (catalog) return catalog.tierId;

  if (modelKey === primaryModelFromEnv()) return 'primary';
  if (modelKey === tertiaryModelFromEnv()) return 'tertiary';
  if (modelKey === 'gpt-5.4-mini') return 'secondary';

  return null;
}

export function resolveProviderForModel(modelKey: string): ModelProvider | null {
  const catalog = getCatalogModel(modelKey);
  if (catalog) return catalog.provider;

  if (modelKey.startsWith('gpt-') || modelKey.startsWith('o1-') || modelKey.startsWith('o3-') || modelKey.startsWith('o4-') || modelKey.includes('codex')) {
    return 'openai';
  }
  if (modelKey.startsWith('meta-llama/') || modelKey.startsWith('llama-') || modelKey.startsWith('openai/')) {
    return 'groq';
  }
  return null;
}

export function getApiProfile(modelKey: string): ModelApiProfile {
  return getCatalogModel(modelKey)?.apiProfile ?? 'responses_chat';
}

export function getWhitelistSelectableModels(): SelectableModelEntry[] {
  const tierOrder: Record<string, number> = { primary: 0, secondary: 1, tertiary: 2 };
  const selectable = getModelCatalog()
    .filter((m) => m.selectableForWhitelist)
    .sort((a, b) => (tierOrder[a.tierId] ?? 9) - (tierOrder[b.tierId] ?? 9));

  const seen = new Set<string>();
  const result: SelectableModelEntry[] = [];
  for (const m of selectable) {
    if (seen.has(m.key)) continue;
    seen.add(m.key);
    result.push({
      key: m.key,
      name: m.name,
      tierId: m.tierId,
      provider: m.provider,
    });
  }
  return result;
}

export function getTier2ModelKeys(): string[] {
  return getModelCatalog().filter((m) => m.tierId === 'secondary').map((m) => m.key);
}

export function getWhitelistSelectableModelsWithAuto(): SelectableModelEntry[] {
  return [
    { key: 'auto', name: 'Auto', tierId: 'auto', provider: 'auto' },
    ...getWhitelistSelectableModels(),
  ];
}
