/**
 * Normalize provider token usage to OpenAI-aligned billing semantics.
 * Budget caps for tier-1/tier-2 use usage.total_tokens from OpenAI Responses API.
 */

import type { ModelRoutingProvider } from '../config/model-routing.js';
import { AI_PARAMS } from '../config/constants.js';

export interface NormalizedTokenUsage {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  source: 'api' | 'tiktoken_estimate' | 'char_estimate';
  rawUsage?: Record<string, unknown>;
}

type OpenAIUsageShape = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

type GroqUsageShape = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

let tiktokenEncoder: { encode: (text: string) => number[] } | null = null;
let tiktokenLoadFailed = false;

async function getTiktokenEncoder(): Promise<{ encode: (text: string) => number[] } | null> {
  if (tiktokenLoadFailed) return null;
  if (tiktokenEncoder) return tiktokenEncoder;
  try {
    const { getEncoding } = await import('js-tiktoken');
    tiktokenEncoder = getEncoding('o200k_base') as { encode: (text: string) => number[] };
    return tiktokenEncoder;
  } catch {
    tiktokenLoadFailed = true;
    console.warn('[TokenUsage] js-tiktoken unavailable; char estimate fallback for OpenAI');
    return null;
  }
}

function estimateTokensFromText(text: string, provider: ModelRoutingProvider): NormalizedTokenUsage {
  const encoder = tiktokenEncoder;
  if (provider === 'openai' && encoder) {
    const count = encoder.encode(text).length;
    return {
      totalTokens: count,
      inputTokens: count,
      outputTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      source: 'tiktoken_estimate',
    };
  }
  const charEstimate = Math.max(1, Math.ceil(text.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN));
  return {
    totalTokens: charEstimate,
    inputTokens: charEstimate,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    source: 'char_estimate',
  };
}

export function normalizeOpenAIUsage(raw: OpenAIUsageShape | null | undefined): NormalizedTokenUsage | null {
  if (!raw) return null;
  const input = raw.input_tokens ?? 0;
  const output = raw.output_tokens ?? 0;
  const total = raw.total_tokens ?? input + output;
  return {
    totalTokens: total,
    inputTokens: input,
    outputTokens: output,
    cachedTokens: raw.input_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: raw.output_tokens_details?.reasoning_tokens ?? 0,
    source: 'api',
    rawUsage: raw as Record<string, unknown>,
  };
}

export function normalizeGroqUsage(raw: GroqUsageShape | null | undefined): NormalizedTokenUsage | null {
  if (!raw) return null;
  const input = raw.prompt_tokens ?? 0;
  const output = raw.completion_tokens ?? 0;
  const total = raw.total_tokens ?? input + output;
  return {
    totalTokens: total,
    inputTokens: input,
    outputTokens: output,
    cachedTokens: 0,
    reasoningTokens: 0,
    source: 'api',
    rawUsage: raw as Record<string, unknown>,
  };
}

export function normalizeTokenUsage(
  provider: ModelRoutingProvider,
  rawUsage: unknown,
  fallbackText?: string,
): NormalizedTokenUsage {
  if (provider === 'openai') {
    const normalized = normalizeOpenAIUsage(rawUsage as OpenAIUsageShape);
    if (normalized) return normalized;
  } else {
    const normalized = normalizeGroqUsage(rawUsage as GroqUsageShape);
    if (normalized) return normalized;
  }

  if (fallbackText?.trim()) {
    return estimateTokensFromText(fallbackText, provider);
  }

  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    source: 'char_estimate',
  };
}

/** Preload tiktoken encoder (optional, call at server startup). */
export async function preloadTiktokenEncoder(): Promise<void> {
  await getTiktokenEncoder();
}

export function usageFromReplyResponse(
  provider: ModelRoutingProvider,
  tokensIn?: number,
  tokensOut?: number,
  rawUsage?: Record<string, unknown>,
  fallbackText?: string,
): NormalizedTokenUsage {
  // Review fix: prefer OpenAI usage.total_tokens (includes reasoning) when raw usage is present.
  if (rawUsage && Object.keys(rawUsage).length > 0) {
    const fromApi = normalizeTokenUsage(provider, rawUsage, fallbackText);
    if (fromApi.source === 'api' && fromApi.totalTokens > 0) {
      return fromApi;
    }
  }
  if (tokensIn != null || tokensOut != null) {
    const input = tokensIn ?? 0;
    const output = tokensOut ?? 0;
    return {
      totalTokens: input + output,
      inputTokens: input,
      outputTokens: output,
      cachedTokens: 0,
      reasoningTokens: 0,
      source: 'api',
    };
  }
  return normalizeTokenUsage(provider, null, fallbackText);
}

export function providerForModelKey(modelKey: string): ModelRoutingProvider {
  return modelKey.startsWith('gpt-') ? 'openai' : 'groq';
}

/** Align reply_tokens stage_breakdown with platform budget token semantics (plan §2a). */
export function stageBreakdownFromReply(response: {
  modelKey: string;
  tokensIn?: number;
  tokensOut?: number;
  rawUsage?: Record<string, unknown>;
  reply?: string;
}): { promptTokens: number; completionTokens: number; totalTokens: number } {
  const usage = usageFromReplyResponse(
    providerForModelKey(response.modelKey),
    response.tokensIn,
    response.tokensOut,
    response.rawUsage,
    response.reply,
  );
  return {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  };
}
