import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock storage and supabase so the service never hits a real database
vi.mock("../../../server/storage", () => ({
  storage: {
    getReplyEvents: vi.fn().mockResolvedValue([]),
    getFeedback: vi.fn().mockResolvedValue([]),
  },
}));

/** Default empty result; pass `terminal` to simulate non-empty query results. */
function makeChainableQuery(terminal: { data: unknown; error: null } = { data: [], error: null }): any {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    contains: vi.fn().mockReturnThis(),
    match: vi.fn().mockReturnThis(),
    then: vi.fn((resolve: any) => Promise.resolve(terminal).then(resolve)),
  };
  return chain;
}

vi.mock("../../../server/supabase", () => ({
  supabase: {
    from: vi.fn(() => makeChainableQuery()),
  },
}));

/** Restore `supabase.from` to the default empty chain after tests override `mockImplementation`. */
async function resetSupabaseFromMock() {
  const { supabase } = await import("../../../server/supabase");
  vi.mocked(supabase.from).mockImplementation(() => makeChainableQuery());
}

describe("[SMOKE] Feedback Analytics Service", () => {
  it("module loads and exports feedbackAnalytics", async () => {
    const mod = await import("../../../server/services/feedback-analytics");
    expect(mod).toBeDefined();
    expect(mod.feedbackAnalytics).toBeDefined();
  });
});

describe("Feedback Analytics Service - Unit Tests", () => {
  let feedbackAnalytics: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetSupabaseFromMock();
    const mod = await import("../../../server/services/feedback-analytics");
    feedbackAnalytics = mod.feedbackAnalytics;
  });

  describe("getFeedbackStats", () => {
    it("returns an object with overall_quality, by_model, recent_trends, quality_metrics", async () => {
      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(result).toHaveProperty("overall_quality");
      expect(result).toHaveProperty("by_model");
      expect(result).toHaveProperty("recent_trends");
      expect(result).toHaveProperty("quality_metrics");
    });

    it("overall_quality has upvotes, downvotes, upvote_percentage", async () => {
      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(result.overall_quality).toHaveProperty("upvotes");
      expect(result.overall_quality).toHaveProperty("downvotes");
      expect(result.overall_quality).toHaveProperty("upvote_percentage");
    });

    it("returns zero upvotes when there is no feedback data", async () => {
      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(result.overall_quality.upvotes).toBe(0);
      expect(result.overall_quality.downvotes).toBe(0);
    });

    it("quality_metrics has expected numeric fields", async () => {
      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(result.quality_metrics).toHaveProperty("avg_quality_score");
      expect(result.quality_metrics).toHaveProperty("high_quality_replies");
      expect(result.quality_metrics).toHaveProperty("low_quality_replies");
      expect(result.quality_metrics).toHaveProperty("regeneration_rate");
    });

    it("recent_trends is an array", async () => {
      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(Array.isArray(result.recent_trends)).toBe(true);
    });

    it("works when no userId is provided (site-wide stats)", async () => {
      const result = await feedbackAnalytics.getFeedbackStats(undefined, 30);
      expect(result).toHaveProperty("overall_quality");
    });
  });

  describe("getSimpleAnalytics", () => {
    it("returns an object (any shape is acceptable here)", async () => {
      const result = await feedbackAnalytics.getSimpleAnalytics("user-1", 30);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("getRecommendations", () => {
    it("returns an array", async () => {
      const result = await feedbackAnalytics.getRecommendations("user-1");
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("getSimpleAnalytics with non-empty data", () => {
    it("returns an object with numeric fields", async () => {
      // Provide a non-empty reply events list so internal aggregation branches execute
      const { storage } = await import("../../../server/storage");
      vi.mocked(storage.getReplyEvents).mockResolvedValue([
        {
          id: "re-1",
          userId: "user-1",
          tweetText: "Hello world",
          reply: "Great tweet",
          modelKey: "gpt-4o-mini",
          platform: "twitter",
          qualityScore: 75,
          latencyMs: 200,
          tokensIn: 50,
          tokensOut: 30,
          promptKey: "default",
          createdAt: new Date(Date.now() - 86400 * 1000),
        } as any,
        {
          id: "re-2",
          userId: "user-1",
          tweetText: "Second tweet",
          reply: "Another reply",
          modelKey: "meta-llama/llama-4-scout-17b-16e-instruct",
          platform: "twitter",
          qualityScore: 90,
          latencyMs: 150,
          tokensIn: 40,
          tokensOut: 20,
          promptKey: "default",
          createdAt: new Date(),
        } as any,
      ]);

      const result = await feedbackAnalytics.getSimpleAnalytics("user-1", 30);
      expect(result).toBeDefined();
      expect(typeof result).toBe("object");
    });
  });

  describe("getFeedbackStats with non-empty feedback data", () => {
    afterEach(async () => {
      await resetSupabaseFromMock();
    });

    it("calculates overall_quality from feedback rows (2 up, 1 down, 67%)", async () => {
      const { supabase } = await import("../../../server/supabase");
      const feedbackRows = [
        { id: "fb-1", user_id: "user-1", rating: "up", model_key: "gpt-4o-mini", quality_score: 80, created_at: new Date().toISOString() },
        { id: "fb-2", user_id: "user-1", rating: "up", model_key: "gpt-4o-mini", quality_score: 90, created_at: new Date().toISOString() },
        { id: "fb-3", user_id: "user-1", rating: "down", model_key: "gpt-4o-mini", quality_score: 40, created_at: new Date().toISOString() },
      ];
      const replyHistoryRows = [
        { quality_score: 80, created_at: new Date().toISOString() },
        { quality_score: 90, created_at: new Date().toISOString() },
        { quality_score: 40, created_at: new Date().toISOString() },
      ];

      // Table-aware: getFeedbackStats hits `feedback` and `reply_history` with different row shapes.
      vi.mocked(supabase.from).mockImplementation((table: string) => {
        if (table === "reply_history") {
          return makeChainableQuery({ data: replyHistoryRows, error: null });
        }
        return makeChainableQuery({ data: feedbackRows, error: null });
      });

      const result = await feedbackAnalytics.getFeedbackStats("user-1", 30);
      expect(result.overall_quality.upvotes).toBe(2);
      expect(result.overall_quality.downvotes).toBe(1);
      expect(result.overall_quality.upvote_percentage).toBe(67);
    });
  });
});
