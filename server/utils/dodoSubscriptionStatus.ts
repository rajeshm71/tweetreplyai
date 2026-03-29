/**
 * Canonical subscription statuses from Dodo / Stripe-style APIs.
 * Used by webhook handlers so variants like past-due / Past Due still match.
 */
const ALLOWED = ['active', 'canceled', 'past_due', 'unpaid', 'failed'] as const;

export type DodoSubscriptionCanonicalStatus = (typeof ALLOWED)[number];

export function normalizeDodoSubscriptionStatus(
  raw: unknown,
): DodoSubscriptionCanonicalStatus | undefined {
  if (raw === undefined || raw === null) return undefined;
  let s = String(raw)
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
    .replace(/\s+/g, '_');
  if (s === 'cancelled') s = 'canceled';
  return (ALLOWED as readonly string[]).includes(s) ? (s as DodoSubscriptionCanonicalStatus) : undefined;
}
