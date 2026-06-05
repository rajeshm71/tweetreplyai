/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { insertTextIntoTwitterDraftArea } from "../../../extension/content/helpers/draft-insert.js";

function buildMockComposer() {
  const composer = document.createElement("div");
  composer.setAttribute("data-testid", "toolBar");

  const textArea = document.createElement("div");
  textArea.setAttribute("data-testid", "tweetTextarea_0");
  textArea.setAttribute("role", "textbox");
  textArea.setAttribute("contenteditable", "true");

  const inner = document.createElement("div");
  const span = document.createElement("span");
  span.setAttribute("data-text", "true");
  span.textContent = "";
  inner.appendChild(span);
  textArea.appendChild(inner);

  const placeholder = document.createElement("div");
  placeholder.setAttribute("data-testid", "tweetTextarea_0Placeholder");
  placeholder.textContent = "Post your reply";
  textArea.appendChild(placeholder);

  document.body.append(composer, textArea);
  return { composer, textArea };
}

function buildDraftComposerWithContents() {
  const composer = document.createElement("div");
  composer.setAttribute("data-testid", "toolBar");

  const textArea = document.createElement("div");
  textArea.setAttribute("data-testid", "tweetTextarea_0");
  textArea.setAttribute("role", "textbox");
  textArea.setAttribute("contenteditable", "true");

  const contents = document.createElement("div");
  contents.setAttribute("data-contents", "true");
  contents.innerHTML = `
    <div data-block="true"><span data-offset-key="old-0-0"><span data-text="true">Old A</span></span></div>
    <div data-block="true"><span data-offset-key="old-1-0"><span data-text="true">Old B</span></span></div>
  `;
  textArea.appendChild(contents);
  document.body.append(composer, textArea);
  return { composer, textArea, contents };
}

describe("insertTextIntoTwitterDraftArea", () => {
  let origExecCommand: typeof document.execCommand | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    origExecCommand = document.execCommand;
    // jsdom does not implement execCommand; install a stub so spy/replace works.
    if (typeof document.execCommand !== "function") {
      (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (origExecCommand === undefined) {
      delete (document as unknown as { execCommand?: () => boolean }).execCommand;
    } else {
      document.execCommand = origExecCommand;
    }
  });

  it("uses paste first and skips execCommand when paste applies text", async () => {
    const { composer, textArea } = buildMockComposer();
    const execSpy = vi.spyOn(document, "execCommand").mockReturnValue(true);
    const draftSpan = textArea.querySelector('[data-text="true"]') as HTMLElement;
    const OrigDataTransfer = (globalThis as unknown as { DataTransfer?: unknown }).DataTransfer;
    const OrigClipboardEvent = (globalThis as unknown as { ClipboardEvent?: unknown }).ClipboardEvent;
    class FakeDataTransfer {
      data: Record<string, string> = {};
      setData(type: string, value: string) {
        this.data[type] = value;
      }
    }
    class FakeClipboardEvent extends Event {
      clipboardData: FakeDataTransfer | null;
      constructor(type: string, init?: { bubbles?: boolean; cancelable?: boolean; clipboardData?: FakeDataTransfer }) {
        super(type, { bubbles: init?.bubbles, cancelable: init?.cancelable });
        this.clipboardData = init?.clipboardData ?? null;
      }
    }
    (globalThis as unknown as { DataTransfer: typeof FakeDataTransfer }).DataTransfer = FakeDataTransfer;
    (globalThis as unknown as { ClipboardEvent: typeof FakeClipboardEvent }).ClipboardEvent = FakeClipboardEvent;
    const origDispatch = textArea.dispatchEvent.bind(textArea);
    vi.spyOn(textArea, "dispatchEvent").mockImplementation((ev: Event) => {
      if (ev.type === "paste") {
        draftSpan.textContent = "Hello draft";
      }
      return origDispatch(ev);
    });

    await insertTextIntoTwitterDraftArea(textArea, composer, "Hello draft", {
      sleep: async () => {},
    });

    expect(execSpy).not.toHaveBeenCalled();
    if (OrigDataTransfer === undefined) {
      delete (globalThis as unknown as { DataTransfer?: unknown }).DataTransfer;
    } else {
      (globalThis as unknown as { DataTransfer: unknown }).DataTransfer = OrigDataTransfer;
    }
    if (OrigClipboardEvent === undefined) {
      delete (globalThis as unknown as { ClipboardEvent?: unknown }).ClipboardEvent;
    } else {
      (globalThis as unknown as { ClipboardEvent: unknown }).ClipboardEvent = OrigClipboardEvent;
    }
    execSpy.mockRestore();
  });

  it("falls back to execCommand when paste does not apply text", async () => {
    const { composer, textArea } = buildMockComposer();
    const execSpy = vi.spyOn(document, "execCommand").mockReturnValue(true);

    await insertTextIntoTwitterDraftArea(textArea, composer, "Fallback text", {
      sleep: async () => {},
    });

    expect(execSpy).toHaveBeenCalledWith("insertText", false, "Fallback text");
  });

  it("selects full text area before paste attempt", async () => {
    const { composer, textArea } = buildMockComposer();
    const addRange = vi.fn();
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      removeAllRanges,
      addRange,
    } as unknown as Selection);
    vi.spyOn(document, "execCommand").mockReturnValue(true);

    await insertTextIntoTwitterDraftArea(textArea, composer, "X", {
      sleep: async () => {},
    });

    expect(removeAllRanges).toHaveBeenCalled();
    expect(addRange.mock.calls.length).toBeGreaterThanOrEqual(1);
    const prePasteRange = addRange.mock.calls[0][0] as Range;
    expect(prePasteRange.collapsed).toBe(false);
  });

  it("writes single-line Draft fallback as one block", async () => {
    const { composer, textArea, contents } = buildDraftComposerWithContents();
    vi.spyOn(document, "execCommand").mockReturnValue(false);

    await insertTextIntoTwitterDraftArea(textArea, composer, "Latest only", {
      sleep: async () => {},
    });

    const blocks = contents.querySelectorAll('[data-block="true"]');
    expect(blocks.length).toBe(1);
    const textSpan = contents.querySelector('[data-text="true"]') as HTMLElement | null;
    expect(textSpan?.textContent).toBe("Latest only");
  });

  it("writes multiline Draft fallback as one block per line", async () => {
    const { composer, textArea, contents } = buildDraftComposerWithContents();
    vi.spyOn(document, "execCommand").mockReturnValue(false);

    await insertTextIntoTwitterDraftArea(textArea, composer, "Line one\nLine two\nLine three", {
      sleep: async () => {},
    });

    const blocks = contents.querySelectorAll('[data-block="true"]');
    expect(blocks.length).toBe(3);
    const lines = Array.from(contents.querySelectorAll('[data-text="true"]')).map(
      (el) => (el as HTMLElement).textContent,
    );
    expect(lines).toEqual(["Line one", "Line two", "Line three"]);
  });

  it("updates only targeted composer when multiple composers exist", async () => {
    const first = buildMockComposer();
    const second = buildMockComposer();
    vi.spyOn(document, "execCommand").mockReturnValue(false);

    await insertTextIntoTwitterDraftArea(first.textArea, first.composer, "First text", {
      sleep: async () => {},
    });

    const firstText = (first.textArea.querySelector('[data-text="true"]') as HTMLElement).textContent;
    const secondText = (second.textArea.querySelector('[data-text="true"]') as HTMLElement).textContent;
    expect(firstText).toBe("First text");
    expect(secondText).toBe("");
  });
});
