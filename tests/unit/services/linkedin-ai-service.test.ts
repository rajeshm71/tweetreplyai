import { describe, expect, it, vi, beforeEach } from "vitest";
import { LINKEDIN_REPLY_LIMITS } from "../../../server/config/constants.js";

vi.mock("groq-sdk", () => ({
  Groq: class GroqMock {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: "LinkedIn test reply from Groq" } }],
          usage: { prompt_tokens: 50, completion_tokens: 30 },
        }),
      },
    };
  },
}));

vi.mock("../../../server/services/linkedin-quality-checker", () => ({
  linkedInQualityChecker: {
    checkQuality: vi.fn().mockReturnValue({
      passed: true,
      totalScore: 80,
      parameters: [],
    }),
  },
}));

vi.mock("../../../server/services/linkedin-analysis-agents", () => ({
  linkedInAnalysisAgents: {
    analyzePost: vi.fn().mockResolvedValue({
      understanding: {
        tone: "neutral",
        sentiment: "neutral",
        style: "casual",
        contentType: "other",
        emotionalMarkers: [],
        keyThemes: [],
      },
      intention: {
        intention: "share",
        keyThemes: [],
        actionVerbs: [],
        underlyingPurpose: "",
      },
      enrichedContextPrompt: "",
      timestamp: new Date(),
    }),
  },
}));

vi.mock("../../../server/services/linkedin-prompt-builder", () => ({
  buildLinkedInSystemPrompt: vi.fn().mockResolvedValue("LinkedIn system prompt"),
  buildLinkedInUserPrompt: vi.fn().mockReturnValue("LinkedIn user prompt"),
  resolveLinkedInQualityTargetText: vi.fn(
    (postText: string) => postText,
  ),
}));

const processReplyMock = vi.fn((text: string) => text);

vi.mock("../../../server/services/reply-postprocessor", () => ({
  replyPostProcessor: {
    processReply: (...args: unknown[]) => processReplyMock(...args),
  },
}));

const baseOptions = {
  postText: "Leadership is about listening first, then acting.",
};

describe("[SMOKE] LinkedIn AI Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/linkedin-ai-service");
    expect(mod).toBeDefined();
  }, 20000);
});

describe("LinkedIn AI Service - Unit Tests", () => {
  let generateLinkedInReply: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../server/services/linkedin-ai-service");
    generateLinkedInReply = mod.generateLinkedInReply;
  });

  it("returns a LinkedInReplyResponse with reply, modelKey, and latencyMs", async () => {
    const result = await generateLinkedInReply(baseOptions);
    expect(result).toHaveProperty("reply");
    expect(result).toHaveProperty("modelKey");
    expect(result).toHaveProperty("latencyMs");
  });

  it("reply field is a non-empty string", async () => {
    const result = await generateLinkedInReply(baseOptions);
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("latencyMs is a non-negative number", async () => {
    const result = await generateLinkedInReply(baseOptions);
    expect(typeof result.latencyMs).toBe("number");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("does not throw when called with minimal options", async () => {
    await expect(generateLinkedInReply(baseOptions)).resolves.not.toThrow();
  });

  it("returns a fallback string reply when GROQ_API_KEY is absent (no key in test env)", async () => {
    // GROQ_API_KEY is unset in the test environment; the service returns a placeholder.
    // The groqClient lazy-init returns null → callGroq returns the hardcoded fallback text.
    const result = await generateLinkedInReply(baseOptions);
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("calls shared replyPostProcessor with LinkedIn word cap and replyMode", async () => {
    processReplyMock.mockClear();
    await generateLinkedInReply({
      ...baseOptions,
      replyMode: "enhanced",
    });
    expect(processReplyMock).toHaveBeenCalled();
    const [, replyMode, maxWordsOverride] = processReplyMock.mock.calls[0];
    expect(replyMode).toBe("enhanced");
    expect(maxWordsOverride).toBe(LINKEDIN_REPLY_LIMITS.POST_PROCESSOR_MAX_WORDS);
  });

  it("skips LinkedIn analysis when replyMode is single-sentence", async () => {
    const { linkedInAnalysisAgents } = await import(
      "../../../server/services/linkedin-analysis-agents"
    );
    vi.mocked(linkedInAnalysisAgents.analyzePost).mockClear();

    await generateLinkedInReply({
      ...baseOptions,
      replyMode: "single-sentence",
    });

    expect(linkedInAnalysisAgents.analyzePost).not.toHaveBeenCalled();
    expect(processReplyMock).toHaveBeenCalled();
    const [, replyMode] = processReplyMock.mock.calls[0];
    expect(replyMode).toBe("single-sentence");
  });
});
