import { captureExtensionError } from '../../utils/sentry.js';

/**
 * Pure factory for the "Reuse tweet" modal. Returns a handle with `close()`
 * and `element` so the caller (content script) can focus / dismiss it.
 *
 * All side effects go through `deps` (dependency-injected):
 *   deps.apiClient          — extension/utils/api.js ApiClient instance
 *   deps.postToCompose      — (text: string) => Promise<boolean>
 *   deps.onUsageUpdated     — () => void (usually posts chrome message)
 *   deps.emitTelemetry      — named export from utils/telemetry.js
 *   deps.getUserFacingError — named export from utils/userFacingErrors.js
 *   deps.constants          — REUSE constants (selectors, limits, bands)
 *   deps.loginUrl?          — link for the "Upgrade" CTA on 402 errors
 *   deps.getPromptVariations? — async () => Array<{key,name,description}> (optional override)
 */

const DEFAULT_BANDS = [
  { max: 20, label: 'Minimal' },
  { max: 40, label: 'Light' },
  { max: 60, label: 'Balanced' },
  { max: 80, label: 'Heavy' },
  { max: 100, label: 'Reimagined' },
];

function bandLabelFor(degree, bands = DEFAULT_BANDS) {
  const d = Math.max(0, Math.min(100, Number(degree) || 0));
  for (const b of bands) if (d <= b.max) return b.label;
  return bands[bands.length - 1]?.label || '';
}

function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style') el.style.cssText = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key in el) {
      try { el[key] = value; } catch { el.setAttribute(key, value); }
    } else {
      el.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  }
  return el;
}

function truncate(text, max = 260) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// Prompt-variation keys that make sense for the "Reuse tweet" feature. The
// server's /api/prompts endpoint also exposes reply-centric keys like
// `improve` and `guardrail_violation`; those are silently filtered out so
// they never show up in the Style dropdown.
const REFRAME_PROMPT_KEYS = new Set([
  'default',
  'conversational',
  'direct',
  'analytical',
  'humorous',
  'supportive',
]);

export function createReuseModal(payload, deps) {
  const {
    apiClient,
    postToCompose,
    onUsageUpdated,
    emitTelemetry,
    getUserFacingError,
    constants,
    loginUrl = 'https://tweetreplyai.vercel.app/login',
    getPromptVariations,
  } = deps || {};

  const MODAL_ID = constants?.MODAL_ID || 'tweetreply-reuse-modal';
  const BANDS = constants?.DEGREE_BANDS || DEFAULT_BANDS;
  const DEFAULT_DEGREE = constants?.DEFAULT_DEGREE ?? 50;
  const TWITTER_CHAR_LIMIT = constants?.TWITTER_CHAR_LIMIT ?? 280;
  const LONG_TWEET_CHAR_LIMIT = constants?.LONG_TWEET_CHAR_LIMIT ?? 4000;

  // If a modal already exists, focus it and return a handle that is a no-op
  // on close (the existing modal owns its own lifecycle).
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.focus?.();
    return { element: existing, close: () => {} };
  }

  const { text: sourceText = '', author = '', tweetUrl } = payload || {};

  let requestToken = 0;
  let state = 'idle'; // 'idle' | 'generating' | 'result' | 'error'
  let lastResult = null;

  const overlay = h('div', {
    id: MODAL_ID,
    class: 'tweetreply-reuse-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Reuse tweet',
    tabIndex: '-1',
  });

  const card = h('div', { class: 'tweetreply-reuse-card' });
  overlay.appendChild(card);

  // Header ------------------------------------------------------------------
  const closeBtn = h('button', {
    type: 'button',
    class: 'tweetreply-reuse-close',
    'aria-label': 'Close',
    onclick: () => handle.close(),
  }, '×');
  card.appendChild(h('header', { class: 'tweetreply-reuse-header' }, [
    h('h2', { class: 'tweetreply-reuse-title' }, 'Reuse tweet'),
    closeBtn,
  ]));

  // Source preview ----------------------------------------------------------
  const preview = h('div', { class: 'tweetreply-reuse-preview' });
  if (author) {
    preview.appendChild(h('div', { class: 'tweetreply-reuse-author' }, `@${String(author).replace(/^@/, '')}`));
  }
  const previewBody = h('div', { class: 'tweetreply-reuse-preview-body' });
  const previewShortText = truncate(sourceText, 260);
  const previewFullText = sourceText || '';
  previewBody.textContent = previewShortText;
  preview.appendChild(previewBody);
  if (previewFullText.length > 260) {
    let expanded = false;
    const moreBtn = h('button', {
      type: 'button',
      class: 'tweetreply-reuse-show-more',
      onclick: () => {
        expanded = !expanded;
        previewBody.textContent = expanded ? previewFullText : previewShortText;
        moreBtn.textContent = expanded ? 'Show less' : 'Show more';
      },
    }, 'Show more');
    preview.appendChild(moreBtn);
  }
  card.appendChild(preview);

  // Slider ------------------------------------------------------------------
  const slider = h('input', {
    type: 'range', min: '0', max: '100', step: '1',
    value: String(DEFAULT_DEGREE),
    class: 'tweetreply-reuse-slider',
    'aria-label': 'Degree of change',
  });
  const sliderValue = h('span', { class: 'tweetreply-reuse-degree-value' }, `${DEFAULT_DEGREE}`);
  const sliderLabel = h('span', { class: 'tweetreply-reuse-degree-band' }, bandLabelFor(DEFAULT_DEGREE, BANDS));
  slider.addEventListener('input', () => {
    const d = Number(slider.value) || 0;
    sliderValue.textContent = String(d);
    sliderLabel.textContent = bandLabelFor(d, BANDS);
  });
  card.appendChild(h('label', { class: 'tweetreply-reuse-field' }, [
    h('div', { class: 'tweetreply-reuse-field-label' }, [
      h('span', {}, 'Degree of change'),
      h('span', { class: 'tweetreply-reuse-degree-readout' }, [sliderValue, ' · ', sliderLabel]),
    ]),
    slider,
  ]));

  // Style select ------------------------------------------------------------
  const styleSelect = h('select', { class: 'tweetreply-reuse-style-select', disabled: true });
  styleSelect.appendChild(h('option', { value: '' }, 'Loading styles…'));
  card.appendChild(h('label', { class: 'tweetreply-reuse-field' }, [
    h('div', { class: 'tweetreply-reuse-field-label' }, 'Style'),
    styleSelect,
  ]));

  const loadStyles = async () => {
    const fetchFn = typeof getPromptVariations === 'function'
      ? () => getPromptVariations()
      : () => apiClient?.getPrompts?.();
    try {
      const list = await fetchFn();
      if (!Array.isArray(list) || list.length === 0) throw new Error('no-prompts');
      const filtered = list.filter((p) => {
        const k = p?.key || p?.id;
        return typeof k === 'string' && REFRAME_PROMPT_KEYS.has(k);
      });
      const final = filtered.length > 0 ? filtered : [{ key: 'default', name: 'Default' }];
      styleSelect.innerHTML = '';
      for (const p of final) {
        const opt = document.createElement('option');
        opt.value = p.key || p.id || 'default';
        opt.textContent = p.name || p.label || opt.value;
        if (p.description) opt.title = p.description;
        styleSelect.appendChild(opt);
      }
      styleSelect.disabled = false;
    } catch {
      styleSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = 'default';
      opt.textContent = 'Default';
      styleSelect.appendChild(opt);
      styleSelect.disabled = false;
    }
  };
  loadStyles();

  // Allow long tweet -------------------------------------------------------
  const allowLongCheckbox = h('input', { type: 'checkbox', class: 'tweetreply-reuse-allow-long' });
  card.appendChild(h('label', { class: 'tweetreply-reuse-field tweetreply-reuse-inline' }, [
    allowLongCheckbox,
    h('span', {}, [
      h('span', { class: 'tweetreply-reuse-allow-long-label' }, 'Allow long tweet (X Premium)'),
      h('span', { class: 'tweetreply-reuse-hint' },
        ` Requires X Premium to post tweets longer than ${TWITTER_CHAR_LIMIT} characters.`),
    ]),
  ]));

  // Result ------------------------------------------------------------------
  const resultTextarea = h('textarea', {
    class: 'tweetreply-reuse-result',
    readOnly: true,
    rows: '6',
    placeholder: 'The reframed tweet will appear here after Generate.',
  });
  const qualityChip = h('span', { class: 'tweetreply-reuse-quality', hidden: true });
  const safetyBadge = h('span', { class: 'tweetreply-reuse-safety', hidden: true }, 'Safety rewrite');
  const errorBox = h('div', { class: 'tweetreply-reuse-error', hidden: true, role: 'alert' });

  card.appendChild(h('div', { class: 'tweetreply-reuse-result-wrap' }, [
    h('div', { class: 'tweetreply-reuse-result-header' }, [qualityChip, safetyBadge]),
    resultTextarea,
    errorBox,
  ]));

  // Buttons -----------------------------------------------------------------
  const generateBtn = h('button', { type: 'button', class: 'tweetreply-reuse-generate' }, 'Generate');
  const regenerateBtn = h('button', { type: 'button', class: 'tweetreply-reuse-regenerate', hidden: true }, 'Regenerate');
  const copyBtn = h('button', { type: 'button', class: 'tweetreply-reuse-copy', disabled: true }, 'Copy');
  const postBtn = h('button', { type: 'button', class: 'tweetreply-reuse-post', disabled: true }, 'Post to X');

  card.appendChild(h('footer', { class: 'tweetreply-reuse-footer' }, [
    generateBtn, regenerateBtn, copyBtn, postBtn,
  ]));

  function setState(next, { error } = {}) {
    state = next;
    // NOTE: Generate / Regenerate are intentionally kept clickable while a
    // previous request is in-flight — the `requestToken` guard ensures only
    // the most recent response lands in the UI, and a second click simply
    // supersedes the earlier one.
    if (state === 'generating') {
      errorBox.hidden = true;
      generateBtn.textContent = 'Generating…';
      regenerateBtn.textContent = 'Generating…';
      // While a new request is in-flight, the previous lastResult is known-
      // stale. Disable Copy and Post so the user cannot act on it.
      copyBtn.disabled = true;
      postBtn.disabled = true;
    } else {
      generateBtn.textContent = 'Generate';
      regenerateBtn.textContent = 'Regenerate';
    }
    if (state === 'result' && lastResult) {
      regenerateBtn.hidden = false;
      copyBtn.disabled = false;
      postBtn.disabled = Boolean(lastResult.safetyOutcome);
      qualityChip.hidden = false;
      qualityChip.textContent = `Quality ${Math.round(lastResult.qualityScore || 0)}`;
      safetyBadge.hidden = !lastResult.safetyOutcome;
      resultTextarea.value = lastResult.reframed;
    }
    if (state === 'error' && error) {
      errorBox.hidden = false;
      errorBox.innerHTML = '';
      errorBox.appendChild(h('span', {}, error.message || 'Something went wrong.'));
      if (error.action === 'upgrade') {
        errorBox.appendChild(h('a', {
          href: loginUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
          class: 'tweetreply-reuse-upgrade',
        }, 'Upgrade'));
      }
    }
  }

  async function runGenerate() {
    // Multiple clicks are allowed: we bump the requestToken so late responses
    // from earlier calls are discarded (see token === requestToken checks below).
    const degree = Number(slider.value) || DEFAULT_DEGREE;
    const allowLong = Boolean(allowLongCheckbox.checked);
    const token = ++requestToken;
    setState('generating');

    const charLimit = allowLong ? LONG_TWEET_CHAR_LIMIT : TWITTER_CHAR_LIMIT;
    const startedAt = Date.now();

    try {
      // Telemetry is emitted once per outcome via reuse_generate_success /
      // reuse_generate_error below; we do NOT emit a second reuse_open here.
      const res = await apiClient.reframeTweet({
        source_tweet: sourceText,
        degree,
        source_author: author || undefined,
        source_tweet_url: tweetUrl,
        prompt_variation: styleSelect.value || undefined,
        allow_long: allowLong,
      });
      if (token !== requestToken) return; // late response, ignore

      const safety = res?.meta?.safetyOutcome === 'violation_friendly_reply'
        ? 'violation_friendly_reply'
        : null;
      lastResult = {
        reframed: res?.reframed || '',
        qualityScore: res?.qualityScore || 0,
        degree: res?.degree ?? degree,
        band: res?.band,
        safetyOutcome: safety,
      };
      setState('result');
      onUsageUpdated?.();
      emitTelemetry?.({
        event_type: 'reuse_generate_success',
        surface: 'content',
        context: {
          action: `degree:${lastResult.degree}`,
          note: `band=${lastResult.band || ''};chars=${lastResult.reframed.length};charLimit=${charLimit};latency=${Date.now() - startedAt}`,
        },
      });
    } catch (err) {
      if (token !== requestToken) return;
      const msg = String(err?.message || '');
      // Server / transport failures (5xx or extension messaging) — send to Sentry; skip 401/402/404 noise.
      if (/^5\d\d:/.test(msg) || msg.includes('No response from background') || msg.includes('runtime.lastError')) {
        captureExtensionError(err instanceof Error ? err : new Error(msg), {
          surface: 'reuse_modal',
          phase: 'reframe_generate',
        });
      }
      const ufe = getUserFacingError ? getUserFacingError(err, 'Failed to reframe tweet. Try again.') : { message: 'Failed to reframe tweet. Try again.', action: 'retry' };
      emitTelemetry?.({
        event_type: 'reuse_generate_error',
        surface: 'content',
        error_code: String(err?.message || 'reuse_generate_error').slice(0, 120),
        context: { action: ufe.action, note: `degree=${degree}` },
      });
      if (ufe.action === 'signin') {
        // ApiClient already cleared the token on 401; close the modal.
        handle.close();
        return;
      }
      setState('error', { error: ufe });
    }
  }

  generateBtn.addEventListener('click', runGenerate);
  regenerateBtn.addEventListener('click', runGenerate);

  copyBtn.addEventListener('click', async () => {
    if (!lastResult?.reframed) return;
    try {
      await navigator.clipboard.writeText(lastResult.reframed);
      copyBtn.textContent = 'Copied';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    } catch {
      resultTextarea.removeAttribute('readonly');
      resultTextarea.focus();
      resultTextarea.select();
      copyBtn.textContent = 'Copy manually';
    }
  });

  postBtn.addEventListener('click', async () => {
    if (!lastResult?.reframed || lastResult.safetyOutcome) return;
    postBtn.disabled = true;
    postBtn.textContent = 'Opening…';
    // `postToCompose` will history.pushState('/compose/post') and dispatch a
    // popstate to nudge X's SPA router. Without this flag, our own popstate
    // listener below would then tear down the modal BEFORE postToCompose
    // finishes polling — hiding any timeout/insert error from the user.
    // One pending self-initiated navigation is absorbed.
    ignoreNextPopState = 1;
    try {
      await postToCompose(lastResult.reframed);
      handle.close();
    } catch (err) {
      setState('error', {
        error: { message: err?.message || 'Could not open the compose box.', action: 'retry' },
      });
    } finally {
      // In case postToCompose never ended up firing popstate (e.g. we were
      // already on /compose/), drop the absorbed-navigation credit so a real
      // later popstate still closes the modal.
      ignoreNextPopState = 0;
      postBtn.textContent = 'Post to X';
      postBtn.disabled = Boolean(lastResult?.safetyOutcome);
    }
  });

  // Close behaviors ---------------------------------------------------------
  const onKeydown = (ev) => {
    if (ev.key === 'Escape') { ev.stopPropagation(); handle.close(); }
  };
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) handle.close();
  });
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('popstate', onPopState, true);
  // Counter of self-initiated popstates to ignore. Set by postBtn before
  // calling postToCompose so that our own compose-box navigation does not
  // trigger the modal's own close handler.
  let ignoreNextPopState = 0;
  function onPopState() {
    if (ignoreNextPopState > 0) {
      ignoreNextPopState--;
      return;
    }
    // Real user navigation — invalidate any in-flight response and close.
    requestToken++;
    handle.close();
  }

  emitTelemetry?.({
    event_type: 'reuse_open',
    surface: 'content',
    context: { action: 'modal_open', note: `sourceLen=${sourceText.length}` },
  });

  document.body.appendChild(overlay);
  // Focus the modal so keyboard interactions work immediately.
  requestAnimationFrame(() => overlay.focus?.());

  const handle = {
    element: overlay,
    close() {
      // Invalidate any in-flight response before tearing down.
      requestToken++;
      document.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('popstate', onPopState, true);
      overlay.remove();
    },
    // For tests: let callers trigger a generate without clicking.
    _runGenerate: runGenerate,
  };

  return handle;
}

export { bandLabelFor };
