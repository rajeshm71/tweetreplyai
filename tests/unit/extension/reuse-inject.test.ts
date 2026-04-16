// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { injectReuseButtonsImpl } from "../../../extension/content/helpers/reuse-inject.js";

function makeArticle(opts: { includeShare?: boolean; insideComposer?: boolean } = {}) {
  const article = document.createElement("article");
  article.setAttribute("data-testid", "tweet");

  const group = document.createElement("div");
  group.setAttribute("role", "group");
  group.style.display = "flex";
  group.style.justifyContent = "space-between";

  const mkAction = (testId: string) => {
    const slot = document.createElement("div");
    const btn = document.createElement("button");
    btn.setAttribute("data-testid", testId);
    slot.appendChild(btn);
    return slot;
  };

  group.appendChild(mkAction("reply"));
  group.appendChild(mkAction("retweet"));
  group.appendChild(mkAction("like"));
  group.appendChild(mkAction("bookmark"));
  if (opts.includeShare !== false) {
    group.appendChild(mkAction("share"));
  }

  article.appendChild(group);

  if (opts.insideComposer) {
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const composer = document.createElement("div");
    composer.setAttribute("data-testid", "tweetComposer");
    composer.appendChild(article);
    dialog.appendChild(composer);
    document.body.appendChild(dialog);
    return { article, dialog };
  }

  document.body.appendChild(article);
  return { article };
}

describe("injectReuseButtonsImpl (extension helper)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("injects exactly one Reuse button per article", () => {
    const { article } = makeArticle();
    const injected = new WeakSet<Element>();
    const deps = {
      injected,
      onClick: vi.fn(),
      extractText: vi.fn().mockReturnValue({ text: "Some tweet text that is long enough to reuse.", author: "alice" }),
      extractTweetUrl: vi.fn().mockReturnValue("https://x.com/alice/status/123"),
    };

    injectReuseButtonsImpl(document.body, deps as any);
    injectReuseButtonsImpl(document.body, deps as any); // idempotent

    const buttons = article.querySelectorAll(".tweetreply-reuse-button");
    expect(buttons.length).toBe(1);
  });

  it("inserts the shell BEFORE the share action", () => {
    const { article } = makeArticle();
    const injected = new WeakSet<Element>();
    injectReuseButtonsImpl(document.body, {
      injected,
      onClick: vi.fn(),
      extractText: () => ({ text: "Some tweet text that is long enough to reuse.", author: "alice" }),
      extractTweetUrl: () => "https://x.com/alice/status/123",
    } as any);

    const group = article.querySelector('[role="group"]')!;
    const children = Array.from(group.children);
    const shellIdx = children.findIndex((el) => el.classList.contains("tweetreply-reuse-shell"));
    const shareIdx = children.findIndex((el) => (el as HTMLElement).querySelector('[data-testid="share"]'));
    expect(shellIdx).toBeGreaterThanOrEqual(0);
    expect(shareIdx).toBeGreaterThan(shellIdx);
  });

  it("falls back to appendChild when the share action is missing", () => {
    const { article } = makeArticle({ includeShare: false });
    const injected = new WeakSet<Element>();
    injectReuseButtonsImpl(document.body, {
      injected,
      onClick: vi.fn(),
      extractText: () => ({ text: "Some tweet text that is long enough to reuse.", author: "alice" }),
      extractTweetUrl: () => undefined,
    } as any);

    const group = article.querySelector('[role="group"]')!;
    const lastChild = group.children[group.children.length - 1];
    expect(lastChild.classList.contains("tweetreply-reuse-shell")).toBe(true);
  });

  it("skips articles nested inside the compose dialog preview", () => {
    const { article } = makeArticle({ insideComposer: true });
    const injected = new WeakSet<Element>();
    injectReuseButtonsImpl(document.body, {
      injected,
      onClick: vi.fn(),
      extractText: () => ({ text: "Some tweet text that is long enough to reuse.", author: "alice" }),
      extractTweetUrl: () => undefined,
    } as any);

    expect(article.querySelector(".tweetreply-reuse-button")).toBeNull();
  });

  it("click passes { text, author, tweetUrl } to onClick and does not open on short source", () => {
    const { article: articleA } = makeArticle();
    const articleB = (() => {
      const art = makeArticle().article;
      return art;
    })();
    const injected = new WeakSet<Element>();
    const onClick = vi.fn();

    injectReuseButtonsImpl(document.body, {
      injected,
      onClick,
      extractText: (article: HTMLElement) =>
        article === articleA
          ? { text: "This is a tweet long enough to reuse.", author: "alice" }
          : { text: "too short", author: "bob" },
      extractTweetUrl: () => "https://x.com/alice/status/1",
    } as any);

    const buttonA = articleA.querySelector(".tweetreply-reuse-button") as HTMLButtonElement;
    const buttonB = articleB.querySelector(".tweetreply-reuse-button") as HTMLButtonElement;
    expect(buttonA).toBeTruthy();
    expect(buttonB).toBeTruthy();

    buttonA.click();
    expect(onClick).toHaveBeenCalledWith({
      text: "This is a tweet long enough to reuse.",
      author: "alice",
      tweetUrl: "https://x.com/alice/status/1",
    });

    onClick.mockClear();
    buttonB.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("also injects when the root element IS the article (MutationObserver edge case)", () => {
    const { article } = makeArticle();
    const injected = new WeakSet<Element>();
    // Pass the article itself as root, simulating a mutation where the added
    // node is the <article>, not a wrapping cell. querySelectorAll on a root
    // excludes the root itself, so this exercises the rootIsArticle branch.
    injectReuseButtonsImpl(article, {
      injected,
      onClick: vi.fn(),
      extractText: () => ({ text: "Some tweet text that is long enough to reuse.", author: "alice" }),
      extractTweetUrl: () => undefined,
    } as any);

    expect(article.querySelectorAll(".tweetreply-reuse-button").length).toBe(1);
  });

  it("does not re-inject when a .tweetreply-reuse-button is already present", () => {
    const { article } = makeArticle();
    const group = article.querySelector('[role="group"]')!;
    const stray = document.createElement("button");
    stray.className = "tweetreply-reuse-button";
    group.appendChild(stray);

    const injected = new WeakSet<Element>();
    injectReuseButtonsImpl(document.body, {
      injected,
      onClick: vi.fn(),
      extractText: () => ({ text: "a".repeat(40), author: "alice" }),
      extractTweetUrl: () => undefined,
    } as any);

    expect(article.querySelectorAll(".tweetreply-reuse-button").length).toBe(1);
  });
});
