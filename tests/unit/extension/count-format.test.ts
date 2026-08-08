import { describe, expect, it } from 'vitest';
import { formatCompactCount, parseCountToNumber, coerceCountToNumber } from '../../../extension/utils/count-format.js';

describe('parseCountToNumber', () => {
  it('parses plain integers and comma-separated numbers', () => {
    expect(parseCountToNumber('12345')).toBe(12345);
    expect(parseCountToNumber('12,345')).toBe(12345);
  });

  it('parses K/M/B suffixes', () => {
    expect(parseCountToNumber('1.2K')).toBe(1200);
    expect(parseCountToNumber('5M')).toBe(5000000);
    expect(parseCountToNumber('2B')).toBe(2000000000);
  });

  it('returns 0 for invalid input', () => {
    expect(parseCountToNumber('')).toBe(0);
    expect(parseCountToNumber('abc')).toBe(0);
    expect(parseCountToNumber(null)).toBe(0);
  });

  it('accepts numeric input', () => {
    expect(parseCountToNumber(850)).toBe(850);
  });
});

describe('coerceCountToNumber', () => {
  it('coerces numbers and numeric strings', () => {
    expect(coerceCountToNumber(12345)).toBe(12345);
    expect(coerceCountToNumber('15841109')).toBe(15841109);
    expect(coerceCountToNumber('1.2K')).toBe(1200);
  });

  it('returns undefined for invalid values', () => {
    expect(coerceCountToNumber(undefined)).toBeUndefined();
    expect(coerceCountToNumber('abc')).toBeUndefined();
    expect(coerceCountToNumber(-1)).toBeUndefined();
  });
});

describe('formatCompactCount', () => {
  it('preserves preferred DOM label', () => {
    expect(formatCompactCount(1200, '1.2K')).toBe('1.2K');
  });

  it('formats raw numbers in X-style compact labels', () => {
    expect(formatCompactCount(12345)).toBe('12.3K');
    expect(formatCompactCount(1200)).toBe('1.2K');
    expect(formatCompactCount(1000)).toBe('1K');
    expect(formatCompactCount(850)).toBe('850');
    expect(formatCompactCount(1500000)).toBe('1.5M');
  });

  it('handles invalid raw numbers', () => {
    expect(formatCompactCount(NaN)).toBe('0');
    expect(formatCompactCount(-5)).toBe('0');
  });
});
