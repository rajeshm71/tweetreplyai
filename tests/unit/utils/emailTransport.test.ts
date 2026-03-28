import { describe, it, expect } from 'vitest';
import { toResendIdempotencyKeyHeader } from '../../../server/utils/emailTransport';

describe('emailTransport', () => {
  describe('toResendIdempotencyKeyHeader', () => {
    it('returns key unchanged when length <= 256', () => {
      const k = 'welcome:user-abc';
      expect(toResendIdempotencyKeyHeader(k)).toBe(k);
    });

    it('returns sha256 hex when key exceeds 256 chars', () => {
      const long = 'a'.repeat(300);
      const out = toResendIdempotencyKeyHeader(long);
      expect(out).toHaveLength(64);
      expect(out).toMatch(/^[a-f0-9]+$/);
    });
  });
});
