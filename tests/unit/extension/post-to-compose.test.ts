// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postReframedToComposeImpl } from "../../../extension/content/helpers/post-to-compose.js";

function mountCompose({ delayMs = 0 }: { delayMs?: number } = {}) {
  const mount = () => {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const textArea = document.createElement("div");
    textArea.setAttribute("data-testid", "tweetTextarea_0");
    const toolbar = document.createElement("div");
    toolbar.setAttribute("data-testid", "toolBar");
    dialog.appendChild(textArea);
    dialog.appendChild(toolbar);
    document.body.appendChild(dialog);
    return { dialog, textArea, toolbar };
  };
  if (delayMs <= 0) return Promise.resolve(mount());
  return new Promise<ReturnType<typeof mount>>((resolve) => {
    setTimeout(() => resolve(mount()), delayMs);
  });
}

describe("postReframedToComposeImpl", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    history.replaceState({}, "", "/home");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pushState('/compose/post') exactly once when not already on a compose path", async () => {
    const mounted = mountCompose();
    const pushStateSpy = vi.spyOn(history, "pushState");
    const insertText = vi.fn().mockResolvedValue(undefined);

    await mounted;
    const result = await postReframedToComposeImpl("Hello world", {
      insertText,
      config: { composePath: "/compose/post", pollMs: 10, timeoutMs: 1000 },
    });

    expect(result).toBe(true);
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalledWith({}, "", "/compose/post");
  });

  it("does NOT push state when already on a compose path", async () => {
    history.replaceState({}, "", "/compose/post");
    await mountCompose();
    const pushStateSpy = vi.spyOn(history, "pushState");
    const insertText = vi.fn().mockResolvedValue(undefined);

    await postReframedToComposeImpl("Hello", {
      insertText,
      config: { composePath: "/compose/post", pollMs: 10, timeoutMs: 1000 },
    });

    expect(pushStateSpy).not.toHaveBeenCalled();
  });

  it("calls insertText(textArea, toolbar, text) when the dialog mounts", async () => {
    const { textArea, toolbar } = await mountCompose();
    const insertText = vi.fn().mockResolvedValue(undefined);

    await postReframedToComposeImpl("my reframed tweet", {
      insertText,
      config: { composePath: "/compose/post", pollMs: 10, timeoutMs: 1000 },
    });

    expect(insertText).toHaveBeenCalledTimes(1);
    expect(insertText).toHaveBeenCalledWith(textArea, toolbar, "my reframed tweet");
  });

  it("waits for the dialog to mount lazily within the timeout", async () => {
    const insertText = vi.fn().mockResolvedValue(undefined);
    // mount after 30ms; we poll every 10ms with a 1s timeout.
    mountCompose({ delayMs: 30 });
    const res = await postReframedToComposeImpl("delayed tweet", {
      insertText,
      config: { composePath: "/compose/post", pollMs: 10, timeoutMs: 1000 },
    });
    expect(res).toBe(true);
    expect(insertText).toHaveBeenCalled();
  });

  it("times out and writes to clipboard when the compose dialog never mounts", async () => {
    const insertText = vi.fn();
    const clipboardWrite = vi.fn().mockResolvedValue(undefined);
    const emitTelemetry = vi.fn();

    await expect(
      postReframedToComposeImpl("clip me", {
        insertText,
        clipboardWrite,
        emitTelemetry,
        config: { composePath: "/compose/post", pollMs: 5, timeoutMs: 30 },
      }),
    ).rejects.toThrow(/Compose box did not open in time/);

    expect(insertText).not.toHaveBeenCalled();
    expect(clipboardWrite).toHaveBeenCalledWith("clip me");
    const events = emitTelemetry.mock.calls.map((c) => c[0].event_type);
    expect(events).toContain("reuse_post_to_compose_timeout");
  });

  it("throws if required deps are missing", async () => {
    // @ts-expect-error purposely malformed
    await expect(postReframedToComposeImpl("x", {})).rejects.toThrow(/missing deps/);
  });
});
