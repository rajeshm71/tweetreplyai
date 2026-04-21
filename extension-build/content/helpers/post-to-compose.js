/**
 * Navigate to X's native compose dialog and insert `text` into the textarea.
 * Pure & dependency-injected so tests can run without the full content script.
 *
 * deps:
 *   insertText:   (textArea, toolbar, text) => Promise<void>
 *   emitTelemetry?: (event) => void
 *   clipboardWrite?: (text) => Promise<void>   // defaults to navigator.clipboard.writeText
 *   sleep?: (ms) => Promise<void>              // defaults to setTimeout wrapper
 *   now?: () => number                         // defaults to Date.now
 *   config: {
 *     composePath: string,
 *     pollMs: number,
 *     timeoutMs: number,
 *   }
 */
export async function postReframedToComposeImpl(text, deps) {
  const {
    insertText,
    emitTelemetry,
    clipboardWrite,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => Date.now(),
    config,
  } = deps || {};

  if (!config || typeof insertText !== 'function') {
    throw new Error('postReframedToCompose: missing deps');
  }

  const composePath = config.composePath || '/compose/post';
  if (!window.location.pathname.startsWith('/compose/')) {
    try {
      history.pushState({}, '', composePath);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } catch {
      // Best-effort; the poll below will still try to find the dialog.
    }
  }

  const started = now();
  while (now() - started < config.timeoutMs) {
    const dialog = document.querySelector('[role="dialog"]');
    const textArea = dialog?.querySelector('[data-testid="tweetTextarea_0"]');
    const toolbar = dialog?.querySelector('[data-testid="toolBar"]');
    if (textArea && toolbar) {
      await insertText(textArea, toolbar, text);
      emitTelemetry?.({
        event_type: 'reuse_post_to_compose',
        surface: 'content',
        context: { action: 'insert', note: `chars=${text.length}` },
      });
      return true;
    }
    await sleep(config.pollMs);
  }

  emitTelemetry?.({
    event_type: 'reuse_post_to_compose_timeout',
    surface: 'content',
    context: { action: 'timeout', note: `chars=${text.length}` },
  });

  const writeClipboard = clipboardWrite
    || (typeof navigator !== 'undefined' && navigator.clipboard?.writeText
      ? (s) => navigator.clipboard.writeText(s)
      : null);
  if (writeClipboard) {
    try { await writeClipboard(text); } catch { /* best effort */ }
  }
  throw new Error('Compose box did not open in time. Reframed text copied to clipboard.');
}
