import { modelRouter as openaiRouter, ReplyOptions, ReplyResponse } from "./openai.js";
import { geminiModelRouter } from "./gemini.js";
import { groqModelRouter } from "./groq.js";

export interface ModelInfo {
  key: string;
  name: string;
  provider: "openai" | "gemini" | "groq";
  inputCost: number;
  outputCost: number;
  contextWindow: number;
  description: string;
}

export class UnifiedAIRouter {
  // Determine which provider handles a given model
  private getProviderForModel(modelKey: string): "openai" | "gemini" | "groq" | null {
    // OpenAI models
    if (modelKey.startsWith("gpt-")) {
      return "openai";
    }
    
    // Gemini models
    if (modelKey.startsWith("gemini-")) {
      return "gemini";
    }

    // Groq models (Llama models)
    if (modelKey.startsWith("meta-llama/") || modelKey.startsWith("llama-")) {
      return "groq";
    }

    return null;
  }

  async generateReply(options: ReplyOptions): Promise<ReplyResponse> {
    if (!options.modelPreference) {
      // Default to GPT-4o-mini for automatic routing (most cost-effective stable model)
      return openaiRouter.generateReply({
        ...options,
        modelPreference: "gpt-4o-mini",
      });
    }

    const provider = this.getProviderForModel(options.modelPreference);
    
    switch (provider) {
      case "openai":
        return openaiRouter.generateReply(options);
      
      case "gemini":
        return geminiModelRouter.generateReply(options);
      
      case "groq":
        return groqModelRouter.generateReply(options);
      
      default:
        throw new Error(`Unknown model: ${options.modelPreference}`);
    }
  }

  // Get all available models from all providers
  getAllModels(): ModelInfo[] {
    const openaiModels = openaiRouter.getAvailableModels().map(model => ({
      ...model,
      provider: "openai" as const,
    }));

    const geminiModels = geminiModelRouter.getAvailableModels().map(model => ({
      ...model,
      provider: "gemini" as const,
    }));

    const groqModels = groqModelRouter.getAvailableModels().map(model => ({
      ...model,
      provider: "groq" as const,
    }));

    return [...openaiModels, ...geminiModels, ...groqModels].sort((a, b) => {
      // Sort by provider first, then by cost (cheapest first)
      if (a.provider !== b.provider) {
        return a.provider.localeCompare(b.provider);
      }
      return a.inputCost - b.inputCost;
    });
  }

  // Get models grouped by provider for UI display
  getModelsByProvider() {
    const allModels = this.getAllModels();
    
    return {
      openai: allModels.filter(m => m.provider === "openai"),
      gemini: allModels.filter(m => m.provider === "gemini"),
      groq: allModels.filter(m => m.provider === "groq"),
    };
  }

  // Get model information
  getModelInfo(modelKey: string): ModelInfo | null {
    const provider = this.getProviderForModel(modelKey);
    
    if (provider === "openai") {
      const info = openaiRouter.getModelInfo(modelKey);
      return info ? { ...info, key: modelKey, provider: "openai" } : null;
    }
    
    if (provider === "gemini") {
      const info = geminiModelRouter.getModelInfo(modelKey);
      return info ? { ...info, key: modelKey, provider: "gemini" } : null;
    }

    if (provider === "groq") {
      const info = groqModelRouter.getModelInfo(modelKey);
      return info ? { ...info, key: modelKey, provider: "groq" } : null;
    }

    return null;
  }

  // Calculate estimated cost for a request
  estimateCost(modelKey: string, inputTokens: number, outputTokens: number): number {
    const modelInfo = this.getModelInfo(modelKey);
    if (!modelInfo) return 0;

    const inputCost = (inputTokens / 1_000_000) * modelInfo.inputCost;
    const outputCost = (outputTokens / 1_000_000) * modelInfo.outputCost;
    
    return inputCost + outputCost;
  }

  // Get recommended model based on tweet complexity and budget
  getRecommendedModel(tweetText: string, maxCostPerRequest?: number): string {
    const allModels = this.getAllModels();
    
    // Estimate token usage (rough approximation)
    const estimatedInputTokens = Math.ceil(tweetText.length / 4) + 100; // +100 for system prompt
    const estimatedOutputTokens = 50; // Typical reply length
    
    // Filter models by cost if budget is specified
    let availableModels = allModels;
    if (maxCostPerRequest) {
      availableModels = allModels.filter(model => {
        const estimatedCost = this.estimateCost(model.key, estimatedInputTokens, estimatedOutputTokens);
        return estimatedCost <= maxCostPerRequest;
      });
    }
    
    if (availableModels.length === 0) {
      // Fallback to cheapest model
      return allModels.sort((a, b) => a.inputCost - b.inputCost)[0].key;
    }
    
    // For complex tweets, prefer more capable models
    const isComplex = tweetText.length > 280 || 
      /https?:\/\/[^\s]+/.test(tweetText) || 
      /@\w+/.test(tweetText) ||
      /#\w+/.test(tweetText);
    
    if (isComplex) {
      // Return most capable model within budget
      return availableModels.sort((a, b) => b.inputCost - a.inputCost)[0].key;
    } else {
      // Return cheapest model for simple tweets
      return availableModels.sort((a, b) => a.inputCost - b.inputCost)[0].key;
    }
  }
}

export const aiRouter = new UnifiedAIRouter();