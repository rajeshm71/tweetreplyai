/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { extractTweetPlainText } from "../../../extension/content/helpers/tweet-text-extract.js";

function buildTweetText(html: string) {
  const el = document.createElement("div");
  el.setAttribute("data-testid", "tweetText");
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

describe("extractTweetPlainText", () => {
  it("preserves line breaks from br tags", () => {
    const el = buildTweetText("Line one<br>Line two<br>Line three");
    expect(extractTweetPlainText(el)).toBe("Line one\nLine two\nLine three");
  });

  it("preserves breaks between block divs", () => {
    const el = buildTweetText("<div>Hook line</div><div>Body line</div>");
    expect(extractTweetPlainText(el)).toBe("Hook line\nBody line");
  });

  it("preserves list-like lines with dash markers", () => {
    const el = buildTweetText(
      "Three tips:<br>- Ship fast<br>- Talk to users<br>- Iterate daily",
    );
    const text = extractTweetPlainText(el);
    expect(text).toContain("- Ship fast");
    expect(text.split("\n").length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty string for null input", () => {
    expect(extractTweetPlainText(null)).toBe("");
  });

  it("collapses excessive blank lines", () => {
    const el = buildTweetText("A<br><br><br><br>B");
    expect(extractTweetPlainText(el)).toBe("A\n\nB");
  });
});
