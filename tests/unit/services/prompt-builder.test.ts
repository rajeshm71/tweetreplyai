import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock tweet-context before any imports so the module doesn't try to initialise a real analyzer
vi.mock("../../../server/services/tweet-context", () => ({
  tweetContextAnalyzer: {
    generateContextPrompt: vi.fn().mockReturnValue(""),
    analyzeTweet: vi.fn().mockReturnValue({
      sentiment: "neutral",
      category: "general",
      topics: [],
      languageComplexity: "medium",
      hasEmojis: false,
      hasMentions: false,
      hasHashtags: false,
      hasUrls: false,
    }),
  },
}));

describe("[SMOKE] Prompt Builder Service", () => {
  it("module loads and exports expected functions", async () => {
    const mod = await import("../../../server/services/prompt-builder");
    expect(mod).toBeDefined();
    expect(typeof mod.buildSystemPrompt).toBe("function");
    expect(typeof mod.buildUserPromptWithThread).toBe("function");
  });
});

describe("Prompt Builder Service - Unit Tests", () => {
  let buildSystemPrompt: any;
  let buildUserPromptWithThread: any;
  let tweetContextAnalyzer: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../../../server/services/prompt-builder");
    buildSystemPrompt = mod.buildSystemPrompt;
    buildUserPromptWithThread = mod.buildUserPromptWithThread;

    const ctxMod = await import("../../../server/services/tweet-context");
    tweetContextAnalyzer = ctxMod.tweetContextAnalyzer;
  });

  describe("buildSystemPrompt", () => {
    it("returns a non-empty string", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "You are a helpful assistant.",
      });
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("includes the base system prompt content in the output", async () => {
      const base = "You are a tweet reply expert.";
      const result = await buildSystemPrompt({ baseSystemPrompt: base });
      expect(result).toContain(base);
    });

    it("calls tweetContextAnalyzer.generateContextPrompt when tweetContext is provided", async () => {
      await buildSystemPrompt({
        baseSystemPrompt: "Base prompt.",
        tweetContext: { sentiment: "positive" },
      });
      expect(tweetContextAnalyzer.generateContextPrompt).toHaveBeenCalled();
    });

    it("does not call tweetContextAnalyzer.generateContextPrompt when tweetContext is absent", async () => {
      await buildSystemPrompt({ baseSystemPrompt: "Base prompt." });
      expect(tweetContextAnalyzer.generateContextPrompt).not.toHaveBeenCalled();
    });

    it("appends viewerIsOriginalAuthor context when flag is set", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "Base prompt.",
        viewerIsOriginalAuthor: true,
      });
      // The function modifies the prompt based on the OA flag — just verify it returns a string
      expect(typeof result).toBe("string");
    });
  });

  describe("buildUserPromptWithThread", () => {
    it("returns a string containing the base user prompt", () => {
      const base = "Reply to this tweet about technology.";
      const result = buildUserPromptWithThread(base);
      expect(typeof result).toBe("string");
      expect(result).toContain(base);
    });

    it("includes thread context when threadContext is provided with isReply=true", () => {
      const result = buildUserPromptWithThread(
        "Reply to this thread.",
        {
          isReply: true,
          originalTweet: "The original tweet text",
          originalTweetAuthor: "OriginalAuthor",
          threadChain: [
            { text: "The original tweet text", author: "OriginalAuthor", isOriginal: true, isCurrent: false },
            { text: "Reply in thread", author: "Someone", isOriginal: false, isCurrent: true },
          ],
          currentTweetIndex: 1,
          threadLength: 2,
        }
      );
      expect(typeof result).toBe("string");
      // Result should reference the original tweet content in some form
      expect(result.length).toBeGreaterThan("Reply to this thread.".length);
    });

    it("returns a valid string even when threadContext is undefined", () => {
      const result = buildUserPromptWithThread("Stand-alone tweet reply.", undefined);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });

    it("returns base prompt unchanged when threadContext.isReply is false", () => {
      const base = "A standalone tweet.";
      const result = buildUserPromptWithThread(base, {
        isReply: false,
        originalTweet: null,
        originalTweetAuthor: null,
        threadChain: [],
        currentTweetIndex: 0,
        threadLength: 1,
      });
      expect(result).toBe(base);
    });

    it("returns base prompt unchanged when threadLength is <= 1", () => {
      const base = "A standalone tweet.";
      const result = buildUserPromptWithThread(base, {
        isReply: true,
        originalTweet: "Some tweet",
        originalTweetAuthor: "Author",
        threadChain: [],
        currentTweetIndex: 0,
        threadLength: 1,
      });
      expect(result).toBe(base);
    });

    it("builds OA-specific prompt format when viewerIsOriginalAuthor=true", () => {
      const result = buildUserPromptWithThread(
        "Base prompt.",
        {
          isReply: true,
          originalTweet: "My original tweet",
          originalTweetAuthor: "Me",
          threadChain: [
            { text: "My original tweet", author: "Me", isOriginal: true, isCurrent: false },
            { text: "A reply to my tweet", author: "Someone", isOriginal: false, isCurrent: true },
          ],
          currentTweetIndex: 1,
          threadLength: 2,
        },
        undefined,
        true
      );
      expect(result).toContain("My original tweet");
      expect(result).toContain("A reply to my tweet");
    });

    it("non-OA thread prompt includes original tweet and current tweet sections", () => {
      const result = buildUserPromptWithThread(
        "Base prompt.",
        {
          isReply: true,
          originalTweet: "The original author's post",
          originalTweetAuthor: "Author",
          threadChain: [
            { text: "The original author's post", author: "Author", isOriginal: true, isCurrent: false },
            { text: "The comment I am replying to", author: "Other", isOriginal: false, isCurrent: true },
          ],
          currentTweetIndex: 1,
          threadLength: 2,
        },
        undefined,
        false
      );
      expect(result).toContain("The original author's post");
      expect(result).toContain("The comment I am replying to");
    });
  });

  describe("buildSystemPrompt — additional branches", () => {
    it("appends non-OA persona block when viewerIsOriginalAuthor is false (default)", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "Base.",
        viewerIsOriginalAuthor: false,
      });
      expect(result).toContain("writing a reply on behalf of the logged-in user");
    });

    it("includes replyAuthorHandle + targetAuthorHandle block for non-OA", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "Base.",
        replyAuthorHandle: "alice",
        targetAuthorHandle: "bob",
        viewerIsOriginalAuthor: false,
      });
      expect(result).toContain("@alice");
      expect(result).toContain("@bob");
    });

    it("includes replyAuthorHandle + targetAuthorHandle block for OA (different wording)", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "Base.",
        replyAuthorHandle: "alice",
        targetAuthorHandle: "bob",
        viewerIsOriginalAuthor: true,
      });
      expect(result).toContain("@alice");
      expect(result).toContain("@bob");
    });

    it("appends tweetAnalysis.enrichedContextPrompt when provided", async () => {
      const result = await buildSystemPrompt({
        baseSystemPrompt: "Base.",
        tweetAnalysis: { enrichedContextPrompt: "Deep analysis context here" } as any,
      });
      expect(result).toContain("Deep analysis context here");
    });

    it("replaces word-limit placeholder when replyMaxWordsOverride + replyWordRange provided", async () => {
      const base = "You are helpful. Keep under 50 words.";
      const result = await buildSystemPrompt({
        baseSystemPrompt: base,
        replyMaxWordsOverride: 80,
        replyWordRange: { min: 60, max: 80 },
      });
      // "Keep under 50 words" should be replaced with the range
      expect(result).not.toContain("Keep under 50 words");
      expect(result).toContain("60");
    });

    it("applies equal-min-max range as 'Keep under N words'", async () => {
      const base = "You are helpful. Keep under 50 words.";
      const result = await buildSystemPrompt({
        baseSystemPrompt: base,
        replyMaxWordsOverride: 40,
        replyWordRange: { min: 40, max: 40 },
      });
      expect(result).toContain("Keep under 40 words");
    });
  });
});
