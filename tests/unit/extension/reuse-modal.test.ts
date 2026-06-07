// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReuseModal } from "../../../extension/content/helpers/reuse-modal.js";
import { REUSE } from "../../../extension/config/constants.js";

function deferred<T = any>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function makeDeps(overrides: any = {}) {
  const emitTelemetry = vi.fn();
  const getUserFacingError = vi.fn((err: any, fallback?: string) => {
    const msg = String(err?.message || "").toLowerCase();
    if (msg.includes("401")) return { message: "Session expired. Please sign in again.", action: "signin" };
    if (msg.includes("402")) return { message: "Credits exhausted. Upgrade to continue.", action: "upgrade" };
    return { message: fallback || "Try again.", action: "retry" };
  });
  const apiClient = {
    reframeTweet: vi.fn(),
  };
  const postToCompose = vi.fn().mockResolvedValue(true);
  const onUsageUpdated = vi.fn();

  return {
    apiClient,
    postToCompose,
    onUsageUpdated,
    emitTelemetry,
    getUserFacingError,
    constants: REUSE,
    loginUrl: "https://tweetreplyai.vercel.app/login",
    ...overrides,
  };
}

describe("createReuseModal (extension helper)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders preview, slider defaults to 50 / Balanced, degree hint, and shows a close button", async () => {
    const deps = makeDeps();
    const handle = createReuseModal(
      { text: "Source tweet goes here with enough content to reuse.", author: "alice" },
      deps,
    );

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    expect(modal).toBeTruthy();
    expect(modal.querySelector(".tweetreply-reuse-preview-body")?.textContent).toContain("Source tweet");
    const slider = modal.querySelector<HTMLInputElement>(".tweetreply-reuse-slider")!;
    expect(slider.value).toBe("50");
    expect(modal.querySelector(".tweetreply-reuse-degree-band")?.textContent).toBe("Balanced");
    expect(modal.querySelector(".tweetreply-reuse-degree-hint")?.textContent).toMatch(/Clearer takeaway/);
    expect(modal.querySelector(".tweetreply-reuse-style-select")).toBeNull();
    expect(modal.querySelector(".tweetreply-reuse-model-select")).toBeNull();

    handle.close();
    expect(document.getElementById(REUSE.MODAL_ID)).toBeNull();
  });

  it("updates band label when the slider moves", () => {
    const deps = makeDeps();
    createReuseModal({ text: "Some tweet that is long enough.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const slider = modal.querySelector<HTMLInputElement>(".tweetreply-reuse-slider")!;
    const band = modal.querySelector(".tweetreply-reuse-degree-band")!;

    slider.value = "15";
    slider.dispatchEvent(new Event("input"));
    expect(band.textContent).toBe("Minimal");

    slider.value = "85";
    slider.dispatchEvent(new Event("input"));
    expect(band.textContent).toBe("Reimagined");
  });

  const mockSelectableModels = [
    { key: "auto", name: "Auto", tierId: "auto", provider: "auto" },
    { key: "gpt-4.1-mini", name: "GPT-4.1 Mini", tierId: "secondary", provider: "openai" },
    { key: "gpt-5-chat-latest", name: "GPT-5 Chat Latest", tierId: "primary", provider: "openai" },
  ];

  it("renders model select when usagePicker.showModelSelect is true", () => {
    const deps = makeDeps({
      usagePicker: {
        showModelSelect: true,
        selectableModels: mockSelectableModels,
      },
    });
    createReuseModal({ text: "Source tweet goes here with enough content to reuse.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const modelSelect = modal.querySelector<HTMLSelectElement>(".tweetreply-reuse-model-select");
    expect(modelSelect).toBeTruthy();
    expect(modal.querySelector('optgroup[label="Auto"]')).toBeTruthy();
    expect(modal.querySelector('optgroup[label="Tier 2"]')).toBeTruthy();
    expect(modal.querySelector('.tweetreply-reuse-slider')).toBeTruthy();
    const fields = Array.from(modal.querySelectorAll(".tweetreply-reuse-field"));
    const modelFieldIndex = fields.findIndex((f) => f.querySelector(".tweetreply-reuse-model-select"));
    const sliderFieldIndex = fields.findIndex((f) => f.querySelector(".tweetreply-reuse-slider"));
    expect(modelFieldIndex).toBeGreaterThanOrEqual(0);
    expect(sliderFieldIndex).toBeGreaterThan(modelFieldIndex);
  });

  it("Generate sends model_key when an explicit model is selected", async () => {
    const deps = makeDeps({
      usagePicker: {
        showModelSelect: true,
        selectableModels: mockSelectableModels,
      },
    });
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Reframed with gpt-4.1-mini",
      qualityScore: 80,
      originalityScore: 70,
      degree: 50,
      band: "balanced",
      meta: { modelKey: "gpt-4.1-mini", latencyMs: 200, originalityScore: 70 },
    });
    createReuseModal({ text: "This is the source tweet text.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const modelSelect = modal.querySelector<HTMLSelectElement>(".tweetreply-reuse-model-select")!;
    modelSelect.value = "gpt-4.1-mini";

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.apiClient.reframeTweet).toHaveBeenCalledWith(
      expect.objectContaining({
        source_tweet: "This is the source tweet text.",
        model_key: "gpt-4.1-mini",
      }),
    );
  });

  it("Generate omits model_key when Auto is selected", async () => {
    const deps = makeDeps({
      usagePicker: {
        showModelSelect: true,
        selectableModels: mockSelectableModels,
      },
    });
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Auto reframed tweet",
      qualityScore: 75,
      originalityScore: 65,
      degree: 50,
      band: "balanced",
      meta: { modelKey: "gpt-5.4-mini", latencyMs: 150, originalityScore: 65 },
    });
    createReuseModal({ text: "This is the source tweet text.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const modelSelect = modal.querySelector<HTMLSelectElement>(".tweetreply-reuse-model-select")!;
    modelSelect.value = "auto";

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.apiClient.reframeTweet.mock.calls[0][0]).not.toHaveProperty("model_key");
  });

  it("renders optional guidance textarea after degree slider", () => {
    const deps = makeDeps();
    createReuseModal({ text: "Source tweet goes here with enough content to reuse.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    expect(modal.querySelector(".tweetreply-reuse-guidance")).toBeTruthy();
    const fields = Array.from(modal.querySelectorAll(".tweetreply-reuse-field"));
    const guidanceFieldIndex = fields.findIndex((f) => f.querySelector(".tweetreply-reuse-guidance"));
    const sliderFieldIndex = fields.findIndex((f) => f.querySelector(".tweetreply-reuse-slider"));
    const allowLongIndex = fields.findIndex((f) => f.querySelector(".tweetreply-reuse-allow-long"));
    expect(guidanceFieldIndex).toBeGreaterThan(sliderFieldIndex);
    expect(allowLongIndex).toBeGreaterThan(guidanceFieldIndex);
  });

  it("Generate sends reuse_guidance when guidance textarea is filled", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Shorter casual rewrite.",
      qualityScore: 80,
      originalityScore: 70,
      degree: 50,
      band: "balanced",
      meta: { modelKey: "gpt-4o-mini", latencyMs: 200, originalityScore: 70 },
    });
    createReuseModal({ text: "This is the source tweet text.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const guidance = modal.querySelector<HTMLTextAreaElement>(".tweetreply-reuse-guidance")!;
    guidance.value = "Make it shorter and more casual";

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.apiClient.reframeTweet).toHaveBeenCalledWith(
      expect.objectContaining({
        reuse_guidance: "Make it shorter and more casual",
      }),
    );
  });

  it("Generate omits reuse_guidance when guidance textarea is empty", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Default rewrite.",
      qualityScore: 75,
      originalityScore: 65,
      degree: 50,
      band: "balanced",
      meta: { modelKey: "gpt-4o-mini", latencyMs: 150, originalityScore: 65 },
    });
    createReuseModal({ text: "This is the source tweet text.", author: "alice" }, deps);

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.apiClient.reframeTweet.mock.calls[0][0]).not.toHaveProperty("reuse_guidance");
  });

  it("Generate calls apiClient.reframeTweet with the expected payload and fills the textarea", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "A reframed tweet!",
      qualityScore: 82,
      originalityScore: 74,
      degree: 85,
      band: "reimagined",
      meta: { modelKey: "gpt-4o-mini", latencyMs: 200, originalityScore: 74 },
    });
    const handle = createReuseModal(
      { text: "This is the source tweet text.", author: "alice", tweetUrl: "https://x.com/alice/status/1" },
      deps,
    );

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const slider = modal.querySelector<HTMLInputElement>(".tweetreply-reuse-slider")!;
    slider.value = "85";
    slider.dispatchEvent(new Event("input"));

    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.apiClient.reframeTweet).toHaveBeenCalledWith(
      expect.objectContaining({
        source_tweet: "This is the source tweet text.",
        degree: 85,
        source_author: "alice",
        source_tweet_url: "https://x.com/alice/status/1",
        allow_long: false,
      }),
    );
    expect(deps.apiClient.reframeTweet.mock.calls[0][0]).not.toHaveProperty("prompt_variation");

    const textarea = modal.querySelector<HTMLTextAreaElement>(".tweetreply-reuse-result")!;
    expect(textarea.value).toBe("A reframed tweet!");
    expect(modal.querySelector(".tweetreply-reuse-quality")?.textContent).toBe("Quality 82");
    expect(modal.querySelector(".tweetreply-reuse-originality")?.textContent).toBe("Originality 74");
    expect(deps.onUsageUpdated).toHaveBeenCalled();
    handle.close();
  });

  it("shows Originality chip when score is 0 (not hidden by falsy check)", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Reframed output text here.",
      qualityScore: 65,
      originalityScore: 0,
      degree: 50,
      band: "balanced",
      meta: { modelKey: "gpt-4o-mini", latencyMs: 200, originalityScore: 0 },
    });
    const handle = createReuseModal(
      { text: "Source tweet with enough characters to reuse.", author: "alice" },
      deps,
    );

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.querySelector(".tweetreply-reuse-originality")?.textContent).toBe("Originality 0");
    handle.close();
  });

  it("shows Upgrade CTA on 402 errors", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockRejectedValueOnce(new Error("402: Payment required - quota exceeded"));

    const handle = createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const errorBox = modal.querySelector(".tweetreply-reuse-error")!;
    expect(errorBox.hidden).toBe(false);
    expect(errorBox.textContent).toMatch(/Credits exhausted/);
    expect(errorBox.querySelector(".tweetreply-reuse-upgrade")).toBeTruthy();
    handle.close();
  });

  it("closes the modal on 401 (session expired)", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockRejectedValueOnce(new Error("401: Unauthorized"));

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById(REUSE.MODAL_ID)).toBeNull();
  });

  it("late-response guard: only the most recent Generate result lands in the textarea", async () => {
    const deps = makeDeps();
    const d1 = deferred<any>();
    const d2 = deferred<any>();
    deps.apiClient.reframeTweet
      .mockImplementationOnce(() => d1.promise)
      .mockImplementationOnce(() => d2.promise);

    const handle = createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    generate.click();
    await Promise.resolve();

    // Resolve the newer request first, then the older one.
    d2.resolve({ reframed: "NEW", qualityScore: 70, degree: 50, band: "balanced", meta: {} });
    await Promise.resolve();
    await Promise.resolve();
    d1.resolve({ reframed: "OLD", qualityScore: 50, degree: 50, band: "balanced", meta: {} });
    await Promise.resolve();
    await Promise.resolve();

    const textarea = modal.querySelector<HTMLTextAreaElement>(".tweetreply-reuse-result")!;
    expect(textarea.value).toBe("NEW");
    handle.close();
  });

  it("Post to X delegates to deps.postToCompose and closes the modal on success", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Ready-to-post tweet",
      qualityScore: 88,
      degree: 50,
      band: "balanced",
      meta: {},
    });

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.postToCompose).toHaveBeenCalledWith("Ready-to-post tweet");
    expect(document.getElementById(REUSE.MODAL_ID)).toBeNull();
  });

  it("safety-rewrite meta disables Post to X and shows the safety badge", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "We can't reuse content like this, but here's a safer take.",
      qualityScore: 70,
      degree: 50,
      band: "balanced",
      meta: { safetyOutcome: "violation_friendly_reply" },
    });

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    const postBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!;
    expect(postBtn.disabled).toBe(true);
    const badge = modal.querySelector<HTMLElement>(".tweetreply-reuse-safety")!;
    expect(badge.hidden).toBe(false);
  });

  it("disables Copy and Post to X while a regenerate is in flight (stale selection guard)", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "First result",
      qualityScore: 80,
      degree: 50,
      band: "balanced",
      meta: {},
    });
    const second = deferred<any>();
    deps.apiClient.reframeTweet.mockImplementationOnce(() => second.promise);

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    const copyBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-copy")!;
    const postBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!;
    expect(copyBtn.disabled).toBe(false);
    expect(postBtn.disabled).toBe(false);

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-regenerate")!.click();
    await Promise.resolve();

    expect(copyBtn.disabled).toBe(true);
    expect(postBtn.disabled).toBe(true);

    second.resolve({ reframed: "Second result", qualityScore: 80, degree: 50, band: "balanced", meta: {} });
    await Promise.resolve();
    await Promise.resolve();

    expect(copyBtn.disabled).toBe(false);
    expect(postBtn.disabled).toBe(false);
  });

  it("absorbs the self-initiated popstate from postToCompose so a timeout error can still render in the modal", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet.mockResolvedValueOnce({
      reframed: "Might time out",
      qualityScore: 80,
      degree: 50,
      band: "balanced",
      meta: {},
    });
    // Simulate the real helper: dispatch popstate (to nudge X's SPA router)
    // and then REJECT because the compose dialog never mounted. Without the
    // modal's ignoreNextPopState guard, our own listener would tear the modal
    // down before the rejection path can render the error.
    deps.postToCompose = vi.fn(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
      throw new Error("Compose box did not open in time. Reframed text copied to clipboard.");
    });

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    const modal = document.getElementById(REUSE.MODAL_ID)!;
    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!.click();
    await Promise.resolve();
    await Promise.resolve();

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // The modal must still be mounted so the timeout error is visible…
    expect(document.getElementById(REUSE.MODAL_ID)).toBeTruthy();
    const errorBox = modal.querySelector<HTMLElement>(".tweetreply-reuse-error")!;
    expect(errorBox.hidden).toBe(false);
    expect(errorBox.textContent).toMatch(/did not open in time|Compose box/);

    // …and a genuine later popstate (e.g. the user hits Back) should still
    // tear it down — the guard only absorbs the one self-initiated event.
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(document.getElementById(REUSE.MODAL_ID)).toBeNull();
  });

  it("keeps multiple generations in past-variations panel; Copy uses selected row", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet
      .mockResolvedValueOnce({
        reframed: "First variation text",
        qualityScore: 80,
        originalityScore: 70,
        degree: 50,
        band: "balanced",
        meta: {},
      })
      .mockResolvedValueOnce({
        reframed: "Second variation text",
        qualityScore: 81,
        originalityScore: 72,
        degree: 60,
        band: "balanced",
        meta: {},
      });

    const handle = createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    await Promise.resolve();
    await Promise.resolve();

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(modal.querySelector(".tweetreply-reuse-past-variations-btn")).toBeTruthy();

    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    const textarea = modal.querySelector<HTMLTextAreaElement>(".tweetreply-reuse-result")!;
    expect(textarea.value).toBe("Second variation text");

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-past-variations-btn")!.click();
    await Promise.resolve();

    const rows = modal.querySelectorAll(".tweetreply-reuse-past-row");
    expect(rows.length).toBe(2);
    (rows[rows.length - 1] as HTMLElement).click();
    await Promise.resolve();

    expect(textarea.value).toBe("First variation text");

    const copyBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-copy")!;
    copyBtn.click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("First variation text");

    handle.close();
  });

  it("Post to X uses the selected variation text when an older row is chosen in past panel", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet
      .mockResolvedValueOnce({
        reframed: "Post me",
        qualityScore: 80,
        degree: 50,
        band: "balanced",
        meta: {},
      })
      .mockResolvedValueOnce({
        reframed: "Not this one",
        qualityScore: 80,
        degree: 50,
        band: "balanced",
        meta: {},
      });

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    await Promise.resolve();
    await Promise.resolve();

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    await Promise.resolve();
    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-past-variations-btn")!.click();
    await Promise.resolve();
    const rows = modal.querySelectorAll(".tweetreply-reuse-past-row");
    (rows[rows.length - 1] as HTMLElement).click();
    await Promise.resolve();

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(deps.postToCompose).toHaveBeenCalledWith("Post me");
  });

  it("when the latest variation has a safety outcome, Post is disabled until user selects a safe row", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet
      .mockResolvedValueOnce({
        reframed: "Safe to post",
        qualityScore: 80,
        degree: 50,
        band: "balanced",
        meta: {},
      })
      .mockResolvedValueOnce({
        reframed: "Unsafe rewrite",
        qualityScore: 70,
        degree: 50,
        band: "balanced",
        meta: { safetyOutcome: "violation_friendly_reply" },
      });

    createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    await Promise.resolve();
    await Promise.resolve();

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    await Promise.resolve();
    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    const postBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-post")!;
    expect(postBtn.disabled).toBe(true);

    modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-past-variations-btn")!.click();
    await Promise.resolve();
    const rows = modal.querySelectorAll(".tweetreply-reuse-past-row");
    (rows[rows.length - 1] as HTMLElement).click();
    await Promise.resolve();

    expect(postBtn.disabled).toBe(false);
  });

  it("after a generate error, Copy still works for a prior successful variation", async () => {
    const deps = makeDeps();
    deps.apiClient.reframeTweet
      .mockResolvedValueOnce({
        reframed: "Already have this",
        qualityScore: 80,
        degree: 50,
        band: "balanced",
        meta: {},
      })
      .mockRejectedValueOnce(new Error("500: Server error"));

    const handle = createReuseModal({ text: "This source tweet is long enough.", author: "alice" }, deps);
    await Promise.resolve();
    await Promise.resolve();

    const modal = document.getElementById(REUSE.MODAL_ID)!;
    const generate = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-generate")!;
    generate.click();
    await Promise.resolve();
    await Promise.resolve();

    generate.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const errorBox = modal.querySelector<HTMLElement>(".tweetreply-reuse-error")!;
    expect(errorBox.hidden).toBe(false);

    const copyBtn = modal.querySelector<HTMLButtonElement>(".tweetreply-reuse-copy")!;
    expect(copyBtn.disabled).toBe(false);
    copyBtn.click();
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Already have this");

    handle.close();
  });
});
