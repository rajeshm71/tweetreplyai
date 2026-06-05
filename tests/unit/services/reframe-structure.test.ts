import { describe, expect, it } from "vitest";
import {
  analyzeTweetStructure,
  formatReframeLineBreaks,
  isCollapsedTweetOutput,
} from "../../../server/services/reframe-structure";

describe("reframe-structure", () => {
  it("detects dense paragraph sources", () => {
    const source =
      "This is a long paragraph with multiple ideas. It should be split for readers. Here is another sentence.";
    const structure = analyzeTweetStructure(source);
    expect(structure.isDenseParagraph).toBe(true);
    expect(structure.sentenceCount).toBeGreaterThanOrEqual(2);
  });

  it("detects list-like multiline sources", () => {
    const source = "Tips:\n- Ship fast\n- Talk to users\n- Iterate";
    const structure = analyzeTweetStructure(source);
    expect(structure.isListLike).toBe(true);
    expect(structure.lineCount).toBe(4);
  });

  it("flags collapsed output for paragraph source", () => {
    const source =
      "This is a long paragraph with multiple ideas. It should be split for readers. Here is another sentence.";
    const output =
      "This is a long paragraph with multiple ideas. It should be split for readers. Here is another sentence.";
    expect(isCollapsedTweetOutput(source, output)).toBe(true);
  });

  it("allows short one-liner output", () => {
    const source = "Just ship it.";
    const output = "Just ship it.";
    expect(isCollapsedTweetOutput(source, output)).toBe(false);
  });

  it("does not flag multiline output", () => {
    const source = "A. B. C.";
    const output = "A.\nB.\nC.";
    expect(isCollapsedTweetOutput(source, output)).toBe(false);
  });

  it("splits dense paragraph into multiple lines", () => {
    const input =
      "First sentence here. Second sentence follows. Third sentence closes it.";
    const out = formatReframeLineBreaks(input);
    expect(out.includes("\n")).toBe(true);
    expect(out.split("\n").length).toBeGreaterThanOrEqual(2);
  });

  it("preserves existing newlines", () => {
    const input = "Line one\nLine two";
    expect(formatReframeLineBreaks(input)).toBe("Line one\nLine two");
  });

  it("leaves short one-liners unchanged", () => {
    const input = "Ship it today.";
    expect(formatReframeLineBreaks(input)).toBe("Ship it today.");
  });
});
