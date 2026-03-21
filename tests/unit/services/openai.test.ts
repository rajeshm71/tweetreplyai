import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock OpenAI SDK — uses the Responses API (openai.responses.create)
vi.mock("openai", () => ({
  default: class OpenAI {
    responses = {
      create: vi.fn().mockResolvedValue({
        output_text: "Test reply from OpenAI",
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    };
  },
}));

vi.mock("../../../server/services/prompt-builder", () => ({
  buildSystemPrompt: vi.fn().mockResolvedValue("Mock system prompt"),
  buildUserPromptWithThread: vi.fn().mockReturnValue("Mock user prompt"),
}));

vi.mock("../../../server/services/tweet-context", () => ({
  tweetContextAnalyzer: {
    generateContextPrompt: vi.fn().mockReturnValue(""),
    analyzeTweet: vi.fn().mockReturnValue({ sentiment: "neutral", category: "general", topics: [] }),
  },
}));

const baseOptions = {
  tweetText: "AI is transforming the way we work.",
};

describe("[SMOKE] OpenAI Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/openai");
    expect(mod).toBeDefined();
  });
});

describe("OpenAI ModelRouter - Unit Tests", () => {
  let ModelRouter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../server/services/openai");
    ModelRouter = mod.ModelRouter;
  });

  it("generateReply returns a ReplyResponse with reply, modelKey, and latencyMs", async () => {
    const router = new ModelRouter();
    const result = await router.generateReply(baseOptions);

    expect(result).toHaveProperty("reply");
    expect(result).toHaveProperty("modelKey");
    expect(result).toHaveProperty("latencyMs");
  });

  it("reply field is a string with content", async () => {
    const router = new ModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("latencyMs is a non-negative number", async () => {
    const router = new ModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("modelKey is a non-empty string", async () => {
    const router = new ModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(typeof result.modelKey).toBe("string");
    expect(result.modelKey.length).toBeGreaterThan(0);
  });

  it("does not throw on a successful API call", async () => {
    const router = new ModelRouter();
    await expect(router.generateReply(baseOptions)).resolves.not.toThrow();
  });
});
