// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  combineReplyAndCta,
  extractCanonicalComposerText,
  normalizeComposerText,
} from "../../../extension/content/helpers/composer-text.js";

describe("extension composer text helpers", () => {
  it("normalizes CRLF and nbsp values", () => {
    expect(normalizeComposerText("hello\r\nworld\u00a0")).toBe("hello\nworld");
  });

  it("extracts only first data-text span to avoid duplicated mirror text", () => {
    const composer = document.createElement("div");
    composer.innerHTML = `
      <span data-text="true">Reply once only</span>
      <span data-text="true">Reply once only</span>
    `;
    expect(extractCanonicalComposerText(composer)).toBe("Reply once only");
  });

  it("falls back to nested contenteditable when data-text span missing", () => {
    const composer = document.createElement("div");
    composer.innerHTML = `<div contenteditable="true">Nested editor text</div>`;
    expect(extractCanonicalComposerText(composer)).toBe("Nested editor text");
  });

  it("falls back to composer text when nested sources are absent", () => {
    const composer = document.createElement("div");
    composer.textContent = "Composer fallback";
    expect(extractCanonicalComposerText(composer)).toBe("Composer fallback");
  });

  it("returns empty string for malformed composer input", () => {
    expect(extractCanonicalComposerText(null as unknown as Element)).toBe("");
  });

  it("combines reply and cta with exactly one separator", () => {
    expect(combineReplyAndCta("Reply body", "CTA body")).toBe("Reply body\n\nCTA body");
  });

  it("returns existing text when CTA is empty", () => {
    expect(combineReplyAndCta("Reply body", "   ")).toBe("Reply body");
  });
});
