/**
 * Shared non-technical error copy for popup and content script (recovery UX).
 * Keep in sync with product messaging; do not surface internal terms.
 */
export function getUserFacingError(error, fallback = 'Something went wrong. Try again.') {
  const raw = String(error?.message ?? '').toLowerCase();
  if (raw.includes('401') || raw.includes('unauthorized')) {
    return { message: 'Session expired. Please sign in again.', action: 'signin' };
  }
  if (raw.includes('402') || raw.includes('quota') || raw.includes('credits')) {
    return { message: 'Credits exhausted. Upgrade to continue.', action: 'upgrade' };
  }
  if (raw.includes('timeout') || raw.includes('network')) {
    return { message: 'Network issue. Please retry.', action: 'retry' };
  }
  if (raw.includes('429') || raw.includes('cooldown') || raw.includes('please wait before syncing')) {
    return { message: error?.message || 'Sync cooldown active. Please wait before syncing again.', action: 'retry' };
  }
  return { message: fallback, action: 'retry' };
}
