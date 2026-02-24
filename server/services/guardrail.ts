import { Groq } from "groq-sdk";
import { AI_MODELS, AI_PARAMS } from "../config/constants.js";
import type { ReplyResponse } from "./openai.js";
import { getPromptConfig, GUARDRAIL_POLICY_PROMPT } from "./prompts.js";
import { replyPostProcessor } from "./reply-postprocessor.js";

// Separate Groq client for guardrail and friendly refusal prompts
const groq = process.env.GROQ_API_KEY ? new Groq() : null;

export interface GuardrailResult {
  violation: number;
  category: string | null;
  rationale: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    modelKey: string;
    latencyMs: number;
  };
}

/**
 * Run the Groq safeguard model on arbitrary user text.
 * Returns violation metadata; on error, falls back to "no violation" so we never block the main flow.
 */
export async function runGuardrail(userInput: string): Promise<GuardrailResult> {
  if (!groq) {
    return {
      violation: 0,
      category: null,
      rationale: "Guardrail disabled (Groq client not configured).",
    };
  }

  const startTime = Date.now();
  try {
    const response = await groq.chat.completions.create({
      model: AI_MODELS.GUARDRAIL,
      messages: [
        { role: "system", content: GUARDRAIL_POLICY_PROMPT },
        { role: "user", content: userInput },
      ],
      temperature: 0,
      max_completion_tokens: 256,
      top_p: 1,
      response_format: { type: "json_object" },
    });

    const latencyMs = Date.now() - startTime;
    const usageRaw = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const promptTokens = usageRaw?.prompt_tokens ?? 0;
    const completionTokens = usageRaw?.completion_tokens ?? 0;

    const raw = response.choices[0]?.message?.content;
    let parsed: any = {};

    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch (parseError: any) {
        console.error(
          "[Guardrail] Failed to parse safeguard JSON:",
          parseError?.message || parseError,
        );
        parsed = {};
      }
    } else if (raw && typeof raw === "object") {
      parsed = raw;
    }

    const violation =
      parsed?.violation === 1 || parsed?.violation === 0 ? parsed.violation : 0;
    const category =
      typeof parsed?.category === "string" && parsed.category.length > 0
        ? parsed.category
        : null;
    const rationale =
      typeof parsed?.rationale === "string" && parsed.rationale.length > 0
        ? parsed.rationale
        : "No rationale provided.";

    console.log("[Guardrail] Decision:", {
      violation,
      category,
      hasRationale: !!rationale,
      raw:
        typeof raw === "string"
          ? raw.slice(0, 500)
          : raw
          ? JSON.stringify(raw).slice(0, 500)
          : null,
    });

    const usage = {
      promptTokens,
      completionTokens,
      modelKey: AI_MODELS.GUARDRAIL,
      latencyMs,
    };

    return { violation, category, rationale, usage };
  } catch (error: any) {
    console.error("[Guardrail] Error calling safeguard model:", error?.message || error);
    return {
      violation: 0,
      category: null,
      rationale: "Guardrail error; treating as safe.",
    };
  }
}

/**
 * Generate a short, friendly / playful refusal reply based on the original user text
 * and the guardrail rationale. This uses the dedicated guardrail_violation prompt
 * and MUST NOT reuse any of the normal reply prompts.
 */
export async function generateGuardrailFriendlyReply(
  originalUserText: string,
  rationale: string,
): Promise<ReplyResponse> {
  const startTime = Date.now();
  const modelKey = AI_MODELS.DEFAULT;

  if (!groq) {
    console.log("[Guardrail] Groq client not configured; returning fallback friendly reply.");
    return {
      reply: "Nice try, but I'm going to sit this one out 😄",
      modelKey: "guardrail-demo",
      latencyMs: Date.now() - startTime,
    };
  }

  const promptConfig = getPromptConfig("guardrail_violation");

  const truncatedUserText =
    originalUserText.length > 500 ? `${originalUserText.slice(0, 500)}...` : originalUserText;
  const context = `User text: "${truncatedUserText}"
Safety summary: ${rationale || "The request goes beyond what I can safely help with."}`;

  const systemPrompt = promptConfig.systemPrompt;
  const userPrompt = promptConfig.userPrompt(context);

  try {
    console.log("[Guardrail] Generating friendly refusal reply with model:", modelKey);
    const response = await groq.chat.completions.create({
      model: modelKey,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: AI_PARAMS.TEMPERATURE,
      max_completion_tokens: AI_PARAMS.GROQ_MAX_TOKENS,
      top_p: 1,
    });

    const rawReply = response.choices[0]?.message?.content ?? "";
    const processedReply = replyPostProcessor.processReplyLight(rawReply);
    const latencyMs = Date.now() - startTime;

    const usage = response.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
    const estimatedInputTokens = Math.ceil(
      (systemPrompt + userPrompt).length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN,
    );
    const estimatedOutputTokens = Math.ceil(
      processedReply.length / AI_PARAMS.TOKEN_ESTIMATION_CHARS_PER_TOKEN,
    );

    return {
      reply: processedReply,
      modelKey,
      tokensIn: usage?.prompt_tokens ?? estimatedInputTokens,
      tokensOut: usage?.completion_tokens ?? estimatedOutputTokens,
      latencyMs,
    };
  } catch (error: any) {
    const message = error?.message || error?.error?.message || "Unknown error";
    console.error("[Guardrail] Error generating friendly refusal reply:", message);
    return {
      reply: "I'm going to pass on that one, but nice creativity though 😄",
      modelKey,
      latencyMs: Date.now() - startTime,
    };
  }
}

