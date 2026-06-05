/**
 * Build Draft.js-style block DOM for multiline tweet text.
 */

/**
 * @param {string} text
 * @param {string} [keyPrefix]
 * @returns {DocumentFragment}
 */
export function buildDraftBlocksFragment(text, keyPrefix = 'trai') {
  const fragment = document.createDocumentFragment();
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');

  lines.forEach((line, index) => {
    const block = document.createElement('div');
    block.setAttribute('data-block', 'true');
    block.className = 'public-DraftStyleDefault-block public-DraftStyleDefault-ltr';

    const offsetSpan = document.createElement('span');
    offsetSpan.setAttribute('data-offset-key', `${keyPrefix}-${index}-0`);

    const textSpan = document.createElement('span');
    textSpan.dataset.text = 'true';
    textSpan.textContent = line;

    offsetSpan.appendChild(textSpan);
    block.appendChild(offsetSpan);
    fragment.appendChild(block);
  });

  if (lines.length === 0) {
    const block = document.createElement('div');
    block.setAttribute('data-block', 'true');
    block.className = 'public-DraftStyleDefault-block public-DraftStyleDefault-ltr';
    const offsetSpan = document.createElement('span');
    offsetSpan.setAttribute('data-offset-key', `${keyPrefix}-0-0`);
    const textSpan = document.createElement('span');
    textSpan.dataset.text = 'true';
    offsetSpan.appendChild(textSpan);
    block.appendChild(offsetSpan);
    fragment.appendChild(block);
  }

  return fragment;
}

/**
 * @param {HTMLElement} contentRoot - [data-contents="true"]
 * @param {string} text
 * @param {string} [keyPrefix]
 */
export function writeDraftBlocksToContentRoot(contentRoot, text, keyPrefix = 'trai') {
  if (!contentRoot) return;
  contentRoot.replaceChildren(buildDraftBlocksFragment(text, keyPrefix));
}
