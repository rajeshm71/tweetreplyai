import { describe, expect, it } from "vitest";
import { resolveLinkedInQualityTargetText } from "../../../server/services/linkedin-prompt-builder.js";

describe("resolveLinkedInQualityTargetText", () => {
  it("uses post text when replying to a post only", () => {
    const post = "Leadership is about listening first.";
    expect(resolveLinkedInQualityTargetText(post)).toBe(post);
  });

  it("uses current comment text for comment-on-comment threads", () => {
    const post = "Original post text here.";
    const comment = "I think async workflows need clearer norms.";
    const result = resolveLinkedInQualityTargetText(post, {
      isReply: true,
      originalPost: post,
      originalPostAuthor: "author",
      threadChain: [
        { text: post, author: "author", isOriginal: true, isCurrent: false },
        { text: comment, author: "peer", isOriginal: false, isCurrent: true },
      ],
      currentTweetIndex: 1,
      threadLength: 2,
    });
    expect(result).toBe(comment);
  });
});
