import { modelRouter as openaiRouter, ReplyOptions, ReplyResponse } from "./openai.js";
import { groqModelRouter } from "./groq.js";
import { AI_MODELS, AI_PARAMS, LEGACY_OPENAI_FALLBACK, MODEL_SPECS } from "../config/constants.js";
import { resolveProviderForModel } from "../config/model-catalog.js";
import {
  getGroqTertiaryModel,
  getModelRoutingConfig,
  isAutoModelPreference,
  isModelRoutingEnabled,
  type ModelRoutingTier,
} from "../config/model-routing.js";
import {
  buildTierAttemptOrder,
  getTierUsageToday,
  isTierExhausted,
  isTierProviderAvailable,
  recordTierTokenUsage,
} from "./model-token-budget.js";
import { isDemoModelKey } from "../utils/provider-errors.js";
import { usageFromReplyResponse } from "../utils/token-usage.js";

export interface ModelInfo {
  key: string;
  name: string;
  provider: "openai" | "groq";
  inputCost: number;
  outputCost: number;
  contextWindow: number;
  description: string;
}

type TierCallFn = (tier: ModelRoutingTier) => Promise<ReplyResponse>;

export class UnifiedAIRouter {
  private getProviderForModel(modelKey: string): "openai" | "groq" | null {
    return resolveProviderForModel(modelKey);
  }

  private async dispatchToTier(tier: ModelRoutingTier, options: ReplyOptions): Promise<ReplyResponse> {
    const modelKey = tier.model;
    if (tier.provider === "groq") {
      return groqModelRouter.generateReply({ ...options, modelPreference: modelKey });
    }
    return openaiRouter.generateReply({ ...options, modelPreference: modelKey });
  }

  private async dispatchImproveToTier(
    tier: ModelRoutingTier,
    tweetText: string,
    draftReply: string,
  ): Promise<ReplyResponse> {
    const modelKey = tier.model;
    if (tier.provider === "groq") {
      return groqModelRouter.improveDraft(tweetText, draftReply, modelKey);
    }
    return openaiRouter.improveDraft(tweetText, draftReply, modelKey);
  }

  private async dispatchReframeToTier(
    tier: ModelRoutingTier,
    source: string,
    degree: number,
    opts: { allowLong?: boolean; retryBoost?: boolean; reuseGuidance?: string },
  ): Promise<ReplyResponse> {
    const modelKey = tier.model;
    if (tier.provider === "groq") {
      return groqModelRouter.reframeTweet(source, degree, { ...opts, modelPreference: modelKey });
    }
    return openaiRouter.reframeTweet(source, degree, { ...opts, modelPreference: modelKey });
  }

  private async dispatchChatToTier(
    tier: ModelRoutingTier,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<ReplyResponse> {
    const modelKey = tier.model;
    if (tier.provider === "groq") {
      return groqModelRouter.generateChatCompletion(systemPrompt, userPrompt, modelKey);
    }
    return openaiRouter.generateChatCompletion(systemPrompt, userPrompt, modelKey);
  }

  private async recordResponseUsage(tier: ModelRoutingTier, response: ReplyResponse): Promise<void> {
    if (!isModelRoutingEnabled()) return;

    const usage = usageFromReplyResponse(
      tier.provider,
      response.tokensIn,
      response.tokensOut,
      response.rawUsage,
      response.reply,
    );

    await recordTierTokenUsage(tier.id, usage);
  }

  private async executeWithTierChain(
    modelPreference: string | undefined,
    callFn: TierCallFn,
    operationLabel: string,
  ): Promise<ReplyResponse> {
    if (!isModelRoutingEnabled()) {
      return this.executeLegacy(modelPreference, callFn, operationLabel);
    }

    const tiers = await buildTierAttemptOrder(modelPreference);
    if (!tiers.length) {
      throw new Error(`[AI Router] No available providers for ${operationLabel}`);
    }

    let lastError: Error | null = null;

    for (const tier of tiers) {
      if (!isTierProviderAvailable(tier)) {
        console.log(`[AI Router] Skipping ${tier.id} — ${tier.provider} API key not configured`);
        continue;
      }

      if (tier.dailyTokenLimit !== null) {
        const used = await getTierUsageToday(tier.id);
        if (used === null) {
          console.log(`[AI Router] Tier ${tier.id} budget read failed; trying next tier`);
          continue;
        }
        if (isTierExhausted(tier, used)) {
          console.log(`[AI Router] Tier ${tier.id} budget exhausted (${used}/${tier.dailyTokenLimit}), trying next`);
          continue;
        }
      }

      try {
        const response = await callFn(tier);
        if (!response?.modelKey) {
          lastError = new Error(`Provider returned empty response for ${tier.model}`);
          continue;
        }
        if (isDemoModelKey(response.modelKey)) {
          console.log(`[AI Router] ${tier.id} returned demo placeholder; trying next tier`);
          lastError = new Error(`Provider unavailable for ${tier.model}`);
          continue;
        }

        const tierUsageAfter = await this.recordResponseUsage(tier, response);
        const resolvedModelKey = response.modelKey || tier.model;
        console.log(
          `[AI Router] ${operationLabel} succeeded`,
          JSON.stringify({
            tierId: tier.id,
            modelKey: resolvedModelKey,
            tierDefaultModel: tier.model,
            tierUsageAfter,
            requestedModel: modelPreference ?? 'auto',
          }),
        );
        return { ...response, tierId: tier.id, modelKey: resolvedModelKey };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.log(`[AI Router] Tier ${tier.id} (${tier.model}) failed: ${message}`);
        lastError = error instanceof Error ? error : new Error(message);
      }
    }

    throw lastError ?? new Error(`[AI Router] All tiers failed for ${operationLabel}`);
  }

  private async executeLegacy(
    modelPreference: string | undefined,
    callFn: TierCallFn,
    operationLabel: string,
  ): Promise<ReplyResponse> {
    const preferGroqAsPrimary = isAutoModelPreference(modelPreference) || modelPreference === AI_MODELS.FALLBACK;
    const groqTertiary = getGroqTertiaryModel();
    const modelKey = preferGroqAsPrimary ? groqTertiary : modelPreference!;
    const provider = this.getProviderForModel(modelKey);
    const tier: ModelRoutingTier = {
      id: "tertiary",
      model: modelKey,
      provider: provider === "openai" ? "openai" : "groq",
      dailyTokenLimit: null,
    };

    try {
      const response = await callFn(tier);
      if (isDemoModelKey(response.modelKey)) {
        throw new Error(`Provider unavailable for ${modelKey}`);
      }
      return response;
    } catch (error) {
      if (modelKey !== LEGACY_OPENAI_FALLBACK && provider === "groq") {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.log(`[AI Router] Legacy ${modelKey} failed (${message}), falling back to ${LEGACY_OPENAI_FALLBACK}`);
        const fallbackTier: ModelRoutingTier = {
          id: "secondary",
          model: LEGACY_OPENAI_FALLBACK,
          provider: "openai",
          dailyTokenLimit: null,
        };
        return callFn(fallbackTier);
      }
      throw error;
    }
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    return this.executeWithTierChain(options.modelPreference, (tier) => this.dispatchToTier(tier, options), "generateReply");
  }

  async improveDraft(tweetText: string, draftReply: string, modelPreference?: string): Promise<ReplyResponse> {
    console.log(`[AI Router] improveDraft called — modelPreference: ${modelPreference ?? "auto"}`);
    return this.executeWithTierChain(
      modelPreference,
      (tier) => this.dispatchImproveToTier(tier, tweetText, draftReply),
      "improveDraft",
    );
  }

  async reframeTweet(
    source: string,
    degree: number,
    opts: { allowLong?: boolean; retryBoost?: boolean; modelPreference?: string; reuseGuidance?: string } = {},
  ): Promise<ReplyResponse> {
    console.log(`[AI Router] reframeTweet called — degree: ${degree}, modelPreference: ${opts.modelPreference ?? "auto"}`);
    return this.executeWithTierChain(
      opts.modelPreference,
      (tier) => this.dispatchReframeToTier(tier, source, degree, opts),
      "reframeTweet",
    );
  }

  async generateLinkedInCompletion(
    systemPrompt: string,
    userPrompt: string,
    modelPreference?: string,
  ): Promise<ReplyResponse> {
    return this.executeWithTierChain(
      modelPreference,
      (tier) => this.dispatchChatToTier(tier, systemPrompt, userPrompt),
      "generateLinkedInCompletion",
    );
  }

  getAllModels(): ModelInfo[] {
    const groqModels = groqModelRouter.getAvailableModels().map((model) => ({
      ...model,
      provider: "groq" as const,
    }));

    const openaiModels = openaiRouter.getAvailableModels().map((model) => ({
      ...model,
      provider: "openai" as const,
    }));

    return [...groqModels, ...openaiModels];
  }

  getModelsByProvider() {
    const allModels = this.getAllModels();

    return {
      openai: allModels.filter((m) => m.provider === "openai"),
      groq: allModels.filter((m) => m.provider === "groq"),
    };
  }

  getModelInfo(modelKey: string): ModelInfo | null {
    if (modelKey === AI_MODELS.GUARDRAIL) {
      const spec = MODEL_SPECS.GUARDRAIL_SAFEGUARD;
      return {
        key: AI_MODELS.GUARDRAIL,
        name: "Guardrail Safeguard",
        provider: "groq",
        inputCost: spec.inputCost,
        outputCost: spec.outputCost,
        contextWindow: spec.contextWindow,
        description: "Safeguard model for prompt-injection and safety classification",
      };
    }

    const provider = this.getProviderForModel(modelKey);

    if (provider === "groq") {
      const models = groqModelRouter.getAvailableModels();
      const info = models.find((m) => m.key === modelKey);
      return info ? { ...info, provider: "groq" } : null;
    }

    if (provider === "openai") {
      const models = openaiRouter.getAvailableModels();
      const info = models.find((m) => m.key === modelKey);
      return info ? { ...info, provider: "openai" } : null;
    }

    return null;
  }

  estimateCost(modelKey: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = this.getModelInfo(modelKey);
    if (!modelInfo) return 0;

    const inputCost = (inputTokens / AI_PARAMS.TOKEN_COST_DIVISOR) * modelInfo.inputCost;
    const outputCost = (outputTokens / AI_PARAMS.TOKEN_COST_DIVISOR) * modelInfo.outputCost;

    return inputCost + outputCost;
  }

  getRecommendedModel(): string {
    if (!isModelRoutingEnabled()) {
      return getGroqTertiaryModel();
    }
    return getModelRoutingConfig().find((t) => t.id === "primary")?.model ?? AI_MODELS.DEFAULT;
  }
}

export const aiRouter = new UnifiedAIRouter();
