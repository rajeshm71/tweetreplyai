/**
 * Extract plain text from X tweet DOM while preserving line breaks.
 * textContent flattens <br> and block boundaries; this walks the tree instead.
 */

const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE']);

function isBlockElement(node) {
  if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
  const tag = node.tagName;
  if (BLOCK_TAGS.has(tag)) return true;
  const display = typeof window !== 'undefined' && window.getComputedStyle
    ? window.getComputedStyle(node).display
    : '';
  return display === 'block' || display === 'list-item';
}

function normalizeExtractedText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * @param {Element|null|undefined} tweetTextEl - [data-testid="tweetText"] node
 * @returns {string}
 */
export function extractTweetPlainText(tweetTextEl) {
  if (!tweetTextEl) return '';

  const parts = [];
  let lineBuffer = '';

  const flushLine = () => {
    const trimmed = lineBuffer.replace(/[ \t]+/g, ' ').trim();
    if (trimmed) parts.push(trimmed);
    lineBuffer = '';
  };

  const walk = (node, afterBlock = false) => {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      lineBuffer += node.textContent || '';
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const el = /** @type {Element} */ (node);
    const tag = el.tagName;

    if (tag === 'BR') {
      if (!lineBuffer.trim() && parts.length > 0 && parts[parts.length - 1] !== '') {
        parts.push('');
      } else {
        flushLine();
      }
      return;
    }

    if (tag === 'IMG' || tag === 'VIDEO') {
      return;
    }

    const block = isBlockElement(el);
    if (block && lineBuffer.trim()) {
      flushLine();
    }

    for (const child of Array.from(el.childNodes)) {
      walk(child, false);
    }

    if (block || afterBlock) {
      flushLine();
    }
  };

  walk(tweetTextEl);

  if (lineBuffer.trim()) {
    flushLine();
  }

  const joined = parts.join('\n');
  return normalizeExtractedText(joined);
}
