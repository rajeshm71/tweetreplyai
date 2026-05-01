/**
 * Insert plain text into X's Draft.js-based tweet composer (role="textbox").
 * Uses paste first (Draft-owned path), then falls back to insertText and DOM write.
 *
 * @param {HTMLElement} textArea - div[data-testid^="tweetTextarea_"][role="textbox"]
 * @param {HTMLElement} composer - toolbar or wrapper; receives initial click for focus
 * @param {string} text
 * @param {{ sleep: (ms: number) => Promise<void> }} deps
 */
export async function insertTextIntoTwitterDraftArea(textArea, composer, text, deps) {
  const { sleep } = deps;

  composer?.click?.();
  textArea?.focus?.();
  await sleep(20);

  // Select all existing content so paste replaces it.
  try {
    const range = document.createRange();
    range.selectNodeContents(textArea);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  } catch {
    /* best-effort */
  }

  let pasted = false;
  try {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);

    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true,
      clipboardData: dt,
    });

    textArea.dispatchEvent(pasteEvent);
    await sleep(50);

    const dataTextSpan = textArea.querySelector('[data-text="true"]');
    const prefix = text.length ? text.slice(0, Math.min(20, text.length)) : "";
    if (prefix && dataTextSpan?.textContent?.includes(prefix)) {
      pasted = true;
    }
  } catch {
    /* best-effort */
  }

  if (pasted) {
    try {
      const draftSpan = textArea.querySelector('[data-text="true"]');
      if (draftSpan?.firstChild) {
        const endRange = document.createRange();
        endRange.setStart(
          draftSpan.firstChild,
          String(draftSpan.firstChild.textContent || "").length,
        );
        endRange.collapse(true);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(endRange);
      }
    } catch {
      /* best-effort */
    }
    return;
  }

  let inserted = false;
  try {
    inserted = document.execCommand("insertText", false, text);
  } catch {
    inserted = false;
  }

  if (inserted) return;

  const dataTextSpan = textArea?.querySelector?.('[data-text="true"]');
  const targetElement = dataTextSpan ? dataTextSpan.parentElement : textArea;
  if (!targetElement) return;

  const span = document.createElement("span");
  span.dataset.text = "true";
  span.textContent = text;
  if (typeof targetElement.replaceChildren === "function") {
    targetElement.replaceChildren(span);
  } else {
    while (targetElement.firstChild) targetElement.removeChild(targetElement.firstChild);
    targetElement.appendChild(span);
  }
  targetElement.dispatchEvent(
    new InputEvent("input", { bubbles: true, cancelable: true }),
  );
}
