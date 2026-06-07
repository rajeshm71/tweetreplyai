import { captureExtensionError } from '../../utils/sentry.js';
import { createModelSelectElement } from './model-select.js';

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
 *   deps.usagePicker?       — { showModelSelect, selectableModels } for whitelist model dropdown
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

const DEGREE_HINTS = {
  Minimal: 'Copy-edit; same idea, light reword',
  Light: 'Fresher phrasing; same shape',
  Balanced: 'Clearer takeaway; mostly new wording',
  Heavy: 'New packaging; same thesis',
  Reimagined: 'Fresh angle; core insight only',
};

const REUSE_DEGREE_STORAGE_KEY = 'tweetreply_reuse_degree';
const REUSE_GUIDANCE_STORAGE_KEY = 'tweetreply_reuse_guidance';
const REUSE_GUIDANCE_MAX_LENGTH = 300;
const MAX_VARIATIONS = 10;

export function createReuseModal(payload, deps) {
  const {
    apiClient,
    postToCompose,
    onUsageUpdated,
    emitTelemetry,
    getUserFacingError,
    constants,
    loginUrl = 'https://tweetreplyai.vercel.app/login',
    usagePicker,
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
  /** @type {Array<{ id: string, reframed: string, qualityScore: number, originalityScore: number, degree: number, band?: string, safetyOutcome: string | null, createdAt: number }>} */
  let generationHistory = [];
  let selectedId = null;
  let variationSeq = 0;

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

  const pastSheet = h('div', {
    class: 'tweetreply-reuse-past-sheet',
    hidden: true,
    'aria-hidden': 'true',
  });
  const pastPanelTitle = h('h3', { id: 'tweetreply-reuse-past-title', class: 'tweetreply-reuse-past-title' }, 'Past variations');
  const pastPanelClose = h('button', {
    type: 'button',
    class: 'tweetreply-reuse-past-close',
    'aria-label': 'Close past variations',
  }, '×');
  const pastList = h('div', { class: 'tweetreply-reuse-past-list' });
  const pastListScroll = h('div', { class: 'tweetreply-reuse-past-scroll' });
  pastListScroll.appendChild(pastList);
  const pastCapHint = h('div', { class: 'tweetreply-reuse-past-cap', hidden: true }, `Showing last ${MAX_VARIATIONS} variations.`);
  const pastPanel = h('div', {
    class: 'tweetreply-reuse-past-panel',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'tweetreply-reuse-past-title',
    onclick: (ev) => ev.stopPropagation(),
  }, [
    h('div', { class: 'tweetreply-reuse-past-header' }, [pastPanelTitle, pastPanelClose]),
    pastListScroll,
    pastCapHint,
  ]);
  pastSheet.appendChild(pastPanel);
  overlay.appendChild(pastSheet);

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

  // Model picker (whitelist only) -------------------------------------------
  let modelSelectEl = null;
  if (usagePicker?.showModelSelect) {
    modelSelectEl = createModelSelectElement({
      selectableModels: usagePicker.selectableModels ?? null,
      className: 'tweetreply-reuse-model-select',
      title: 'Choose AI model',
    });
    card.appendChild(h('label', { class: 'tweetreply-reuse-field' }, [
      h('div', { class: 'tweetreply-reuse-field-label' }, 'AI model'),
      modelSelectEl,
    ]));
  }

  // Slider ------------------------------------------------------------------
  const slider = h('input', {
    type: 'range', min: '0', max: '100', step: '1',
    value: String(DEFAULT_DEGREE),
    class: 'tweetreply-reuse-slider',
    'aria-label': 'Degree of change',
  });
  const sliderValue = h('span', { class: 'tweetreply-reuse-degree-value' }, `${DEFAULT_DEGREE}`);
  const sliderLabel = h('span', { class: 'tweetreply-reuse-degree-band' }, bandLabelFor(DEFAULT_DEGREE, BANDS));
  const degreeHint = h('div', { class: 'tweetreply-reuse-degree-hint' }, DEGREE_HINTS.Balanced);
  slider.addEventListener('input', () => {
    const d = Number(slider.value) || 0;
    sliderValue.textContent = String(d);
    const label = bandLabelFor(d, BANDS);
    sliderLabel.textContent = label;
    degreeHint.textContent = DEGREE_HINTS[label] || '';
    try {
      chrome?.storage?.local?.set?.({ [REUSE_DEGREE_STORAGE_KEY]: d });
    } catch { /* ignore */ }
  });
  card.appendChild(h('label', { class: 'tweetreply-reuse-field' }, [
    h('div', { class: 'tweetreply-reuse-field-label' }, [
      h('span', {}, 'Degree of change'),
      h('span', { class: 'tweetreply-reuse-degree-readout' }, [sliderValue, ' · ', sliderLabel]),
    ]),
    slider,
    degreeHint,
  ]));

  try {
    chrome?.storage?.local?.get?.([REUSE_DEGREE_STORAGE_KEY], (result) => {
      const saved = Number(result?.[REUSE_DEGREE_STORAGE_KEY]);
      if (!Number.isFinite(saved) || saved < 0 || saved > 100) return;
      slider.value = String(saved);
      sliderValue.textContent = String(saved);
      const label = bandLabelFor(saved, BANDS);
      sliderLabel.textContent = label;
      degreeHint.textContent = DEGREE_HINTS[label] || '';
    });
  } catch { /* ignore */ }

  // Optional author guidance -----------------------------------------------
  const guidanceTextarea = h('textarea', {
    class: 'tweetreply-reuse-guidance',
    rows: '2',
    maxlength: String(REUSE_GUIDANCE_MAX_LENGTH),
    placeholder: 'e.g. shorter, more casual, keep the list format',
    'aria-label': 'Optional reuse guidance',
  });
  card.appendChild(h('label', { class: 'tweetreply-reuse-field' }, [
    h('div', { class: 'tweetreply-reuse-field-label' }, 'Guidance (optional)'),
    guidanceTextarea,
    h('div', { class: 'tweetreply-reuse-hint' }, 'Tone, audience, or format — must stay consistent with the degree slider above.'),
  ]));

  try {
    chrome?.storage?.local?.get?.([REUSE_GUIDANCE_STORAGE_KEY], (result) => {
      const saved = result?.[REUSE_GUIDANCE_STORAGE_KEY];
      if (typeof saved === 'string' && saved.trim()) {
        guidanceTextarea.value = saved.slice(0, REUSE_GUIDANCE_MAX_LENGTH);
      }
    });
  } catch { /* ignore */ }

  guidanceTextarea.addEventListener('input', () => {
    try {
      chrome?.storage?.local?.set?.({
        [REUSE_GUIDANCE_STORAGE_KEY]: guidanceTextarea.value.slice(0, REUSE_GUIDANCE_MAX_LENGTH),
      });
    } catch { /* ignore */ }
  });

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
  const originalityChip = h('span', { class: 'tweetreply-reuse-originality', hidden: true });
  const safetyBadge = h('span', { class: 'tweetreply-reuse-safety', hidden: true }, 'Safety rewrite');
  const errorBox = h('div', { class: 'tweetreply-reuse-error', hidden: true, role: 'alert' });

  const pastVariationsBtn = h('button', {
    type: 'button',
    class: 'tweetreply-reuse-past-variations-btn',
    hidden: true,
  }, 'Past variations');

  card.appendChild(h('div', { class: 'tweetreply-reuse-result-wrap' }, [
    h('div', { class: 'tweetreply-reuse-result-header' }, [qualityChip, originalityChip, safetyBadge]),
    pastVariationsBtn,
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

  function newVariationId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    variationSeq += 1;
    return `reuse-var-${variationSeq}`;
  }

  function buildVariationEntry(res, { degree }) {
    const safety = res?.meta?.safetyOutcome === 'violation_friendly_reply'
      ? 'violation_friendly_reply'
      : null;
    return {
      id: newVariationId(),
      reframed: res?.reframed || '',
      qualityScore: res?.qualityScore || 0,
      originalityScore: res?.originalityScore ?? res?.meta?.originalityScore ?? 0,
      degree: res?.degree ?? degree,
      band: res?.band,
      safetyOutcome: safety,
      createdAt: Date.now(),
    };
  }

  function getSelected() {
    return generationHistory.find((e) => e.id === selectedId) ?? null;
  }

  function trimHistoryIfNeeded() {
    while (generationHistory.length > MAX_VARIATIONS) {
      const removed = generationHistory.shift();
      if (removed?.id === selectedId) {
        selectedId = generationHistory.length
          ? generationHistory[generationHistory.length - 1].id
          : null;
      }
    }
    if (selectedId && !generationHistory.some((e) => e.id === selectedId)) {
      selectedId = generationHistory[generationHistory.length - 1]?.id ?? null;
    }
  }

  function selectPastVariation(entry, idxFromNew) {
    selectedId = entry.id;
    applyResultChrome();
    closePastVariationsPanel();
    emitTelemetry?.({
      event_type: 'reuse_variation_select',
      surface: 'content',
      context: { action: `index:${idxFromNew}`, note: `historyLen=${generationHistory.length}` },
    });
  }

  function renderPastVariationsList() {
    pastList.replaceChildren();
    if (generationHistory.length === 0) {
      pastList.appendChild(h('div', { class: 'tweetreply-reuse-past-empty' }, 'No variations yet.'));
      pastCapHint.hidden = true;
      return;
    }
    pastCapHint.hidden = generationHistory.length < MAX_VARIATIONS;
    const reversed = [...generationHistory].reverse();
    reversed.forEach((entry, idxFromNew) => {
      const metaLine = [
        new Date(entry.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }),
        `Q ${Math.round(entry.qualityScore || 0)}`,
        // Review fix: show O chip even when score is 0 (falsy check hid valid scores).
        entry.originalityScore != null ? `O ${Math.round(entry.originalityScore)}` : null,
      ].filter(Boolean).join(' · ');
      const meta = h('div', { class: 'tweetreply-reuse-past-meta' }, metaLine);
      const preview = h('div', { class: 'tweetreply-reuse-past-preview' }, truncate(entry.reframed, 200));
      const useBtn = h('button', { type: 'button', class: 'tweetreply-reuse-past-use-btn' }, 'Use this');
      useBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectPastVariation(entry, idxFromNew);
      });
      const row = h('div', {
        class: `tweetreply-reuse-past-row${entry.id === selectedId ? ' tweetreply-reuse-past-row--selected' : ''}`,
      });
      row.appendChild(meta);
      row.appendChild(preview);
      row.appendChild(useBtn);
      row.addEventListener('click', (ev) => {
        if (ev.target instanceof HTMLElement && ev.target.closest('button')) return;
        selectPastVariation(entry, idxFromNew);
      });
      pastList.appendChild(row);
    });
  }

  function openPastVariationsPanel() {
    if (generationHistory.length === 0 || state === 'generating') return;
    pastSheet.hidden = false;
    pastSheet.setAttribute('aria-hidden', 'false');
    renderPastVariationsList();
    requestAnimationFrame(() => pastPanelClose.focus());
    emitTelemetry?.({
      event_type: 'reuse_past_variations_open',
      surface: 'content',
      context: { action: 'open', note: `count=${generationHistory.length}` },
    });
  }

  function closePastVariationsPanel() {
    if (pastSheet.hidden) return;
    pastSheet.hidden = true;
    pastSheet.setAttribute('aria-hidden', 'true');
    pastVariationsBtn.focus();
  }

  pastSheet.addEventListener('click', (ev) => {
    if (ev.target === pastSheet) closePastVariationsPanel();
  });
  pastPanelClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closePastVariationsPanel();
  });
  pastVariationsBtn.addEventListener('click', () => {
    if (state === 'generating') return;
    openPastVariationsPanel();
  });

  function updatePastVariationsButton() {
    const n = generationHistory.length;
    if (n === 0) {
      pastVariationsBtn.hidden = true;
      return;
    }
    pastVariationsBtn.hidden = false;
    pastVariationsBtn.textContent = `Past variations (${n})`;
    pastVariationsBtn.disabled = state === 'generating';
  }

  function applyResultChrome() {
    const sel = getSelected();
    if (!sel) {
      qualityChip.hidden = true;
      originalityChip.hidden = true;
      safetyBadge.hidden = true;
      resultTextarea.value = '';
      copyBtn.disabled = true;
      postBtn.disabled = true;
      return;
    }
    qualityChip.hidden = false;
    qualityChip.textContent = `Quality ${Math.round(sel.qualityScore || 0)}`;
    // Review fix: show chip for score 0; only hide when API omitted the field.
    if (sel.originalityScore != null) {
      originalityChip.hidden = false;
      originalityChip.textContent = `Originality ${Math.round(sel.originalityScore)}`;
    } else {
      originalityChip.hidden = true;
    }
    safetyBadge.hidden = !sel.safetyOutcome;
    resultTextarea.value = sel.reframed;
    copyBtn.disabled = false;
    postBtn.disabled = Boolean(sel.safetyOutcome);
  }

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
      // While a new request is in-flight, the prior preview is stale for Copy/Post.
      copyBtn.disabled = true;
      postBtn.disabled = true;
    } else {
      generateBtn.textContent = 'Generate';
      regenerateBtn.textContent = 'Regenerate';
    }
    if (state === 'result') {
      regenerateBtn.hidden = generationHistory.length === 0;
      applyResultChrome();
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
      if (generationHistory.length > 0 && getSelected()) {
        applyResultChrome();
      } else {
        copyBtn.disabled = true;
        postBtn.disabled = true;
      }
    }
    updatePastVariationsButton();
    if (!pastSheet.hidden) renderPastVariationsList();
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
      const modelKey = modelSelectEl?.value || 'auto';
      const guidanceRaw = guidanceTextarea?.value?.trim() || '';
      const res = await apiClient.reframeTweet({
        source_tweet: sourceText,
        degree,
        source_author: author || undefined,
        source_tweet_url: tweetUrl,
        allow_long: allowLong,
        ...(modelKey !== 'auto' ? { model_key: modelKey } : {}),
        ...(guidanceRaw ? { reuse_guidance: guidanceRaw.slice(0, REUSE_GUIDANCE_MAX_LENGTH) } : {}),
      });
      if (token !== requestToken) return;

      const entry = buildVariationEntry(res, { degree });
      generationHistory.push(entry);
      trimHistoryIfNeeded();
      selectedId = entry.id;
      setState('result');
      onUsageUpdated?.();
      emitTelemetry?.({
        event_type: 'reuse_generate_success',
        surface: 'content',
        context: {
          action: `degree:${entry.degree}`,
          note: `band=${entry.band || ''};chars=${entry.reframed.length};charLimit=${charLimit};latency=${Date.now() - startedAt}`,
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
    const sel = getSelected();
    if (!sel?.reframed) return;
    try {
      await navigator.clipboard.writeText(sel.reframed);
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
    const sel = getSelected();
    if (!sel?.reframed || sel.safetyOutcome) return;
    postBtn.disabled = true;
    postBtn.textContent = 'Opening…';
    // `postToCompose` will history.pushState('/compose/post') and dispatch a
    // popstate to nudge X's SPA router. Without this flag, our own popstate
    // listener below would then tear down the modal BEFORE postToCompose
    // finishes polling — hiding any timeout/insert error from the user.
    // One pending self-initiated navigation is absorbed.
    ignoreNextPopState = 1;
    try {
      await postToCompose(sel.reframed);
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
      postBtn.disabled = Boolean(getSelected()?.safetyOutcome);
    }
  });

  // Close behaviors ---------------------------------------------------------
  const onKeydown = (ev) => {
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    if (!pastSheet.hidden) {
      closePastVariationsPanel();
      return;
    }
    handle.close();
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
