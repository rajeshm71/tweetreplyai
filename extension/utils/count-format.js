/**
 * Parse and format follower/engagement counts in X-style compact labels.
 */

const MULTIPLIERS = { K: 1000, M: 1000000, B: 1000000000 };

/**
 * @param {string|number|null|undefined} text
 * @returns {number}
 */
export function parseCountToNumber(text) {
  if (text == null || text === '') return 0;
  if (typeof text === 'number') {
    return Number.isFinite(text) && text >= 0 ? Math.round(text) : 0;
  }
  const cleaned = String(text).replace(/,/g, '').trim();
  const match = cleaned.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) return 0;
  const suffix = match[2]?.toUpperCase();
  return Math.round(num * (MULTIPLIERS[suffix] || 1));
}

/**
 * Strip trailing ".0" from compact suffix labels (e.g. "1.0K" → "1K").
 * @param {string} label
 * @returns {string}
 */
function trimCompactSuffix(label) {
  return label.replace(/\.0([KMB])$/i, '$1');
}

/**
 * @param {number} rawNumber
 * @param {string} [preferredLabel] — DOM label from X UI; returned unchanged when set
 * @returns {string}
 */
export function formatCompactCount(rawNumber, preferredLabel) {
  if (typeof preferredLabel === 'string' && preferredLabel.trim()) {
    return preferredLabel.trim();
  }
  const n = typeof rawNumber === 'number' ? rawNumber : parseCountToNumber(rawNumber);
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 1_000_000) {
    return trimCompactSuffix((n / 1_000_000).toFixed(1) + 'M');
  }
  if (n >= 1_000) {
    return trimCompactSuffix((n / 1_000).toFixed(1) + 'K');
  }
  return String(Math.floor(n));
}
