import { describe, expect, it } from 'vitest';
import { formatReceiptAmount } from '../../../server/utils/receipt';

// Regression test for review #4: Dodo delivers amounts in minor units.
// Previous heuristic (> 1000 ? /100 : raw) mis-formatted small charges 100x.
describe('formatReceiptAmount', () => {
  it('formats a $5.00 charge (500 cents) correctly', () => {
    expect(formatReceiptAmount(500, 'USD')).toBe('$5.00');
  });

  it('formats a $9.99 charge (999 cents) correctly', () => {
    expect(formatReceiptAmount(999, 'USD')).toBe('$9.99');
  });

  it('formats a $129.00 charge (12900 cents) correctly', () => {
    expect(formatReceiptAmount(12900, 'USD')).toBe('$129.00');
  });

  it('formats a zero amount as $0.00 (refund edge case)', () => {
    expect(formatReceiptAmount(0, 'USD')).toBe('$0.00');
  });

  it('uses the supplied currency when valid 3-letter code', () => {
    expect(formatReceiptAmount(500, 'EUR')).toMatch(/5\.00/);
    expect(formatReceiptAmount(500, 'EUR')).toContain('€');
  });

  it('falls back to USD for unknown / missing currency', () => {
    expect(formatReceiptAmount(500, undefined)).toBe('$5.00');
    expect(formatReceiptAmount(500, null)).toBe('$5.00');
    expect(formatReceiptAmount(500, '')).toBe('$5.00');
    expect(formatReceiptAmount(500, 'XX')).toBe('$5.00');
  });

  it('is case-insensitive for currency codes', () => {
    expect(formatReceiptAmount(500, 'usd')).toBe('$5.00');
  });
});
