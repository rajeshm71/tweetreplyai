import { describe, expect, it } from "vitest";
import {
  checkPostRewrite,
  computeOverlapRatio,
  isLikelyPostRewrite,
  longestConsecutiveSharedSequence,
} from "../../../server/services/linkedin-reply-similarity.js";

const VM_AGENTS_POST =
  "The industry is shifting from prompts and API calls to agents running 24/7 on dedicated cloud VMs.";

const VM_AGENTS_BAD_REPLY =
  "The shift from prompts or API calls to agents running 24/7 on dedicated cloud VMs is a significant one, highlighting a major architectural change";

const FRONTIER_POST =
  "Frontier intelligence used to mean paying frontier prices. Advanced AI capabilities are becoming more accessible to everyone.";

const FRONTIER_BAD_REPLY =
  "The assertion that before: frontier intelligence meant paying frontier prices is particularly striking, as it highlights the significant shift towards making advanced AI capabilities more accessible";

describe("linkedin-reply-similarity", () => {
  it("flags VM/agents paraphrase rewrite", () => {
    const result = checkPostRewrite(VM_AGENTS_BAD_REPLY, VM_AGENTS_POST);
    expect(result.isLikelyRewrite).toBe(true);
    expect(isLikelyPostRewrite(VM_AGENTS_BAD_REPLY, VM_AGENTS_POST)).toBe(true);
  });

  it("flags frontier intelligence paraphrase rewrite", () => {
    const result = checkPostRewrite(FRONTIER_BAD_REPLY, FRONTIER_POST);
    expect(result.isLikelyRewrite).toBe(true);
  });

  it("allows low-overlap original-word comment", () => {
    const reply =
      "Yeah — running agents around the clock changes the economics completely compared to one-off API calls.";
    const result = checkPostRewrite(reply, VM_AGENTS_POST);
    expect(result.isLikelyRewrite).toBe(false);
  });

  it("detects long consecutive shared word runs", () => {
    const shared = longestConsecutiveSharedSequence(VM_AGENTS_BAD_REPLY, VM_AGENTS_POST);
    expect(shared).toBeGreaterThanOrEqual(5);
  });

  it("reports overlap ratio for paraphrase replies", () => {
    const ratio = computeOverlapRatio(FRONTIER_BAD_REPLY, FRONTIER_POST);
    expect(ratio).toBeGreaterThan(0.4);
  });

  it("flags near-verbatim rewrite on short posts", () => {
    const shortPost = "Frontier intelligence meant paying frontier prices.";
    const shortReply = "Frontier intelligence meant paying frontier prices for sure";
    expect(checkPostRewrite(shortReply, shortPost).isLikelyRewrite).toBe(true);
  });
});
