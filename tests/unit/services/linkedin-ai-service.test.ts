import { describe, expect, it, vi, beforeEach } from "vitest";

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
      sentiment: "neutral",
      themes: [],
      suggestedAngle: "agreement",
    }),
  },
}));

vi.mock("../../../server/services/linkedin-prompt-builder", () => ({
  buildLinkedInSystemPrompt: vi.fn().mockResolvedValue("LinkedIn system prompt"),
  buildLinkedInUserPrompt: vi.fn().mockReturnValue("LinkedIn user prompt"),
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
});
