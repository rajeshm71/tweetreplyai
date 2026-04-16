/**
 * Pure, dependency-injected helpers for the "Reuse tweet" button on X tweets.
 *
 * Nothing in here imports from `content.js`; all state and side effects come
 * from the injected `deps` object. This keeps the module easy to unit-test
 * under jsdom.
 *
 * deps shape:
 *   {
 *     injected:       WeakSet<HTMLElement>,     // dedupe set (shared with injector)
 *     onClick:        ({ text, author, tweetUrl }) => void,
 *     extractText:    (article: HTMLElement) => { text, author } | null,
 *     extractTweetUrl:(article: HTMLElement) => string | undefined,
 *     minSourceLen?:  number,                   // default 20, matches REUSE.MIN_SOURCE_LEN
 *     buttonClass?:   string,                   // default 'tweetreply-reuse-button'
 *     buttonTitle?:   string,                   // default 'Reuse this tweet with AI'
 *     showToast?:     (message: string) => void,
 *   }
 */

const DEFAULT_MIN_SOURCE_LEN = 20;
const DEFAULT_BUTTON_CLASS = 'tweetreply-reuse-button';
const DEFAULT_BUTTON_TITLE = 'Reuse this tweet with AI';
const SHELL_CLASS = 'tweetreply-reuse-shell';

function buildReuseButton({ buttonClass, buttonTitle, onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = buttonClass;
  btn.setAttribute('aria-label', buttonTitle);
  btn.title = buttonTitle;
  btn.dataset.tweetreplyReuse = '1';
  // Inline SVG so the button is visible even if the stylesheet is missing.
  btn.innerHTML = [
    '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="currentColor">',
    '<path d="M17.5 3A4.5 4.5 0 0 1 22 7.5V12h-2V7.5A2.5 2.5 0 0 0 17.5 5H9v2.5L4.5 4 9 .5V3h8.5zM6.5 21A4.5 4.5 0 0 1 2 16.5V12h2v4.5A2.5 2.5 0 0 0 6.5 19H15v-2.5l4.5 3.5L15 23.5V21H6.5z"/>',
    '</svg>',
  ].join('');
  btn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    onClick();
  });
  return btn;
}

function wrapAsActionItem(btn) {
  const shell = document.createElement('div');
  shell.className = SHELL_CLASS;
  shell.appendChild(btn);
  return shell;
}

function defaultShowToast(message) {
  try {
    let host = document.getElementById('tweetreply-reuse-toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'tweetreply-reuse-toast-host';
      host.style.cssText = [
        'position:fixed',
        'bottom:24px',
        'left:50%',
        'transform:translateX(-50%)',
        'z-index:100001',
        'pointer-events:none',
      ].join(';');
      document.body.appendChild(host);
    }
    const toast = document.createElement('div');
    toast.className = 'tweetreply-reuse-toast';
    toast.textContent = message;
    toast.style.cssText = [
      'background:rgba(15,20,25,0.92)',
      'color:#fff',
      'padding:8px 14px',
      'border-radius:9999px',
      'font-size:13px',
      'margin-top:8px',
      'box-shadow:0 4px 12px rgba(0,0,0,0.15)',
    ].join(';');
    host.appendChild(toast);
    setTimeout(() => toast.remove(), 2400);
  } catch {
    // Toasts are best-effort.
  }
}

/**
 * Injects a single "Reuse" button into every `article[data-testid="tweet"]`
 * inside `container`. Idempotent via the shared `injected` WeakSet.
 */
export function injectReuseButtonsImpl(container, deps) {
  if (!container || !deps) return;
  const {
    injected,
    onClick,
    extractText,
    extractTweetUrl,
    minSourceLen = DEFAULT_MIN_SOURCE_LEN,
    buttonClass = DEFAULT_BUTTON_CLASS,
    buttonTitle = DEFAULT_BUTTON_TITLE,
    showToast = defaultShowToast,
  } = deps;

  const root = typeof container.querySelectorAll === 'function' ? container : null;
  if (!root) return;

  // Handle both cases: the mutation's added node may be a container of
  // articles OR it may be the article element itself (happens occasionally on
  // detail-page navigation). querySelectorAll excludes the root, so add it
  // explicitly when it matches.
  const descendants = Array.from(root.querySelectorAll('article[data-testid="tweet"]'));
  const rootIsArticle =
    typeof root.matches === 'function' && root.matches('article[data-testid="tweet"]');
  const articles = rootIsArticle ? [root, ...descendants] : descendants;

  articles.forEach((article) => {
    if (injected.has(article)) return;
    // Skip the card rendered inside the compose dialog (quoted-tweet preview, etc.).
    if (article.closest('[role="dialog"] [data-testid="tweetComposer"]')) return;
    if (article.querySelector(`.${buttonClass}`)) {
      injected.add(article);
      return;
    }

    const actionGroup = article.querySelector('[role="group"]');
    if (!actionGroup) return;

    const btn = buildReuseButton({
      buttonClass,
      buttonTitle,
      onClick: () => {
        let extracted = null;
        try {
          extracted = extractText(article);
        } catch {
          extracted = null;
        }
        const text = extracted?.text?.trim() || '';
        if (text.length < minSourceLen) {
          showToast('Tweet is too short to reuse.');
          return;
        }
        let tweetUrl;
        try {
          tweetUrl = extractTweetUrl(article);
        } catch {
          tweetUrl = undefined;
        }
        onClick({ text, author: extracted?.author, tweetUrl });
      },
    });

    const shell = wrapAsActionItem(btn);
    // X's action group is a flex row with `justify-content: space-between`.
    // Insert our wrapper BEFORE the last action (`share`) so layout stays balanced.
    const shareAnchor = actionGroup.querySelector('[data-testid="share"]');
    const shareSlot = shareAnchor?.closest('div');
    if (shareSlot && shareSlot.parentNode === actionGroup) {
      actionGroup.insertBefore(shell, shareSlot);
    } else {
      actionGroup.appendChild(shell);
    }
    injected.add(article);
  });
}

export { buildReuseButton, wrapAsActionItem };
