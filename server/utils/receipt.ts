/**
 * Helpers for payment-receipt formatting.
 *
 * Extracted so we can unit-test amount formatting without booting the webhook
 * stack (see `tests/unit/utils/receipt.test.ts`). The previous heuristic
 * (`rawAmount > 1000 ? /100 : rawAmount`) mis-formatted any charge under
 * ~$10 — see review #4.
 */

/**
 * Format a payment amount delivered by Dodo into a human-readable string.
 *
 * Dodo sends amounts in minor units (cents / paisa / etc.) across all
 * currencies we support. This helper divides by 100 unconditionally and
 * formats with `Intl.NumberFormat`.
 */
export function formatReceiptAmount(
  rawMinorUnits: number,
  currency: string | null | undefined,
): string {
  const safeCurrency =
    typeof currency === 'string' && currency.length === 3
      ? currency.toUpperCase()
      : 'USD';
  const major = rawMinorUnits / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: safeCurrency,
  });
  return formatter.format(major);
}
