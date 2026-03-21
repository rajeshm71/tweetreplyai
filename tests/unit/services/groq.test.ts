import { describe, expect, it, vi, beforeEach } from "vitest";

// Returns a fresh async generator on each call — Groq uses stream:true
function makeMockStream() {
  return (async function* () {
    yield { choices: [{ delta: { content: "Test reply" }, finish_reason: null }] };
    yield { choices: [{ delta: { content: " from Groq" }, finish_reason: "stop" }] };
  })();
}

// Keep a reference to the create mock so we can reset it between tests
const mockCreate = vi.fn();

vi.mock("groq-sdk", () => ({
  Groq: class GroqMock {
    chat = { completions: { create: mockCreate } };
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
  tweetText: "Groq makes inference incredibly fast.",
};

describe("[SMOKE] Groq Service", () => {
  it("module loads", async () => {
    const mod = await import("../../../server/services/groq");
    expect(mod).toBeDefined();
  });
});

describe("Groq GroqModelRouter - Unit Tests", () => {
  let GroqModelRouter: any;

  beforeEach(async () => {
    // Provide a FRESH stream for every test — async generators are single-use
    mockCreate.mockResolvedValue(makeMockStream());
    const mod = await import("../../../server/services/groq");
    GroqModelRouter = mod.GroqModelRouter;
  });

  it("returns a ReplyResponse shape with reply, modelKey, and latencyMs", async () => {
    const router = new GroqModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(result).toHaveProperty("reply");
    expect(result).toHaveProperty("modelKey");
    expect(result).toHaveProperty("latencyMs");
  });

  it("reply field is a non-empty string containing the streamed text", async () => {
    const router = new GroqModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });

  it("latencyMs is a non-negative number", async () => {
    const router = new GroqModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("modelKey is a non-empty string", async () => {
    const router = new GroqModelRouter();
    const result = await router.generateReply(baseOptions);
    expect(typeof result.modelKey).toBe("string");
    expect(result.modelKey.length).toBeGreaterThan(0);
  });

  it("does not throw on a successful streaming call", async () => {
    const router = new GroqModelRouter();
    await expect(router.generateReply(baseOptions)).resolves.not.toThrow();
  });
});
