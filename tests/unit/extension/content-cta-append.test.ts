// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  combineReplyAndCta,
  extractCanonicalComposerText,
} from "../../../extension/content/helpers/composer-text.js";

describe("CTA append regression guard", () => {
  it("does not duplicate reply text when composer has mirrored spans", () => {
    const composer = document.createElement("div");
    composer.innerHTML = `
      <div contenteditable="true">
        <span data-text="true">This is a generated reply.</span>
        <span data-text="true">This is a generated reply.</span>
      </div>
    `;

    const existing = extractCanonicalComposerText(composer);
    const combined = combineReplyAndCta(existing, "Book a call: example.com");

    expect(existing).toBe("This is a generated reply.");
    expect(combined).toBe("This is a generated reply.\n\nBook a call: example.com");
    expect(combined.match(/This is a generated reply\./g)?.length ?? 0).toBe(1);
  });

  it("still appends CTA when composer is initially empty", () => {
    const combined = combineReplyAndCta("", "Book a call");
    expect(combined).toBe("Book a call");
  });
});
