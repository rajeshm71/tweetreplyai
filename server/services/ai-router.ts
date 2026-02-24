import { modelRouter as openaiRouter, ReplyOptions, ReplyResponse } from "./openai.js";
import { groqModelRouter } from "./groq.js";
import { AI_MODELS, AI_PARAMS } from "../config/constants.js";

export interface ModelInfo {
  key: string;
  name: string;
  provider: "openai" | "groq";
  inputCost: number;
  outputCost: number;
  contextWindow: number;
  description: string;
}

export class UnifiedAIRouter {
  private getProviderForModel(modelKey: string): "openai" | "groq" | null {
    if (modelKey.startsWith("gpt-")) {
      return "openai";
    }

    if (modelKey.startsWith("meta-llama/") || modelKey.startsWith("llama-")) {
      return "groq";
    }

    return null;
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    const preferFallbackAsPrimary =
      !options.modelPreference ||
      options.modelPreference === "auto" ||
      options.modelPreference === AI_MODELS.FALLBACK;
    const modelKey = preferFallbackAsPrimary ? AI_MODELS.DEFAULT : options.modelPreference!;
    const provider = this.getProviderForModel(modelKey);

    try {
      switch (provider) {
        case "groq":
          return await groqModelRouter.generateReply({ ...options, modelPreference: modelKey });

        case "openai":
          return await openaiRouter.generateReply({ ...options, modelPreference: modelKey });

        default:
          throw new Error(`Unknown model: ${modelKey}`);
      }
    } catch (error) {
      if (modelKey !== AI_MODELS.FALLBACK) {
        const message = error instanceof Error ? error.message : "Unknown error";
        console.log(`⚠️ [AI Router] ${modelKey} failed (${message}), falling back to ${AI_MODELS.FALLBACK}`);
        return openaiRouter.generateReply({ ...options, modelPreference: AI_MODELS.FALLBACK });
      }
      throw error;
    }
  }

  async improveDraft(tweetText: string, draftReply: string, modelPreference?: string): Promise<ReplyResponse> {
    const modelKey = modelPreference || AI_MODELS.DEFAULT;
    const provider = this.getProviderForModel(modelKey);

    console.log(`🔧 [AI Router] improveDraft called - Model: ${modelKey}`);
    console.log(`📝 [AI Router] Tweet text: "${tweetText.substring(0, 50)}..."`);
    console.log(`📝 [AI Router] Draft reply: "${draftReply.substring(0, 50)}..."`);

    if (provider === "groq") {
      return groqModelRouter.improveDraft(tweetText, draftReply, modelKey);
    }
    return openaiRouter.improveDraft(tweetText, draftReply, modelKey);
  }

  getAllModels(): ModelInfo[] {
    const groqModels = groqModelRouter.getAvailableModels().map(model => ({
      ...model,
      provider: "groq" as const,
    }));

    const openaiModels = openaiRouter.getAvailableModels().map(model => ({
      ...model,
      provider: "openai" as const,
    }));

    return [...groqModels, ...openaiModels];
  }

  getModelsByProvider() {
    const allModels = this.getAllModels();

    return {
      openai: allModels.filter(m => m.provider === "openai"),
      groq: allModels.filter(m => m.provider === "groq"),
    };
  }

  getModelInfo(modelKey: string): ModelInfo | null {
    const provider = this.getProviderForModel(modelKey);

    if (provider === "groq") {
      const models = groqModelRouter.getAvailableModels();
      const info = models.find(m => m.key === modelKey);
      return info ? { ...info, provider: "groq" } : null;
    }

    if (provider === "openai") {
      const models = openaiRouter.getAvailableModels();
      const info = models.find(m => m.key === modelKey);
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
    return AI_MODELS.DEFAULT;
  }
}

export const aiRouter = new UnifiedAIRouter();
