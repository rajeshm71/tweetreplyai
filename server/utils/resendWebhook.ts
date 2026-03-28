/**
 * Parse Resend webhook `data` per official payloads: tags are a key-value object
 * (not [{ name, value }]), and `to` is an array of addresses.
 * @see https://resend.com/docs/webhooks/emails/delivered
 */

export function getIdempotencyKeyFromResendWebhookData(data: { tags?: unknown }): string | undefined {
  const tags = data?.tags;
  if (tags == null) return undefined;

  if (typeof tags === 'object' && !Array.isArray(tags)) {
    const raw = (tags as Record<string, unknown>).idempotency_key;
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }

  if (Array.isArray(tags)) {
    const entry = tags.find(
      (t: unknown) =>
        t !== null &&
        typeof t === 'object' &&
        (t as { name?: string }).name === 'idempotency_key' &&
        typeof (t as { value?: string }).value === 'string'
    ) as { value: string } | undefined;
    return entry?.value;
  }

  return undefined;
}

/** Resend sends `to` as string[]; support string for defensive parsing. */
export function getRecipientEmailFromResendWebhookData(data: { to?: unknown }): string | undefined {
  const to = data?.to;
  if (Array.isArray(to) && to.length > 0) {
    const first = to[0];
    return typeof first === 'string' ? first : undefined;
  }
  if (typeof to === 'string') return to;
  return undefined;
}
