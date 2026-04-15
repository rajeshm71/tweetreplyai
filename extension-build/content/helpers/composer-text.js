export function normalizeComposerText(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
}

export function extractCanonicalComposerText(composer) {
  if (!composer) return "";

  // Prefer the first Draft.js text span only; aggregating all spans can duplicate mirrored text.
  const dataTextSpan = composer.querySelector('[data-text="true"]');
  const spanText = normalizeComposerText(dataTextSpan?.textContent || dataTextSpan?.innerText);
  if (spanText) return spanText;

  const contentEditable = composer.querySelector('[contenteditable="true"]');
  if (contentEditable && contentEditable !== composer) {
    const nestedText = normalizeComposerText(contentEditable.innerText || contentEditable.textContent);
    if (nestedText) return nestedText;
  }

  return normalizeComposerText(composer.innerText || composer.textContent);
}

export function combineReplyAndCta(existingText, ctaText) {
  const existing = normalizeComposerText(existingText);
  const cta = normalizeComposerText(ctaText);
  if (!cta) return existing;
  return existing ? `${existing}\n\n${cta}` : cta;
}
