import { describe, expect, it } from 'vitest';
import {
  normalizeDodoSubscriptionStatus,
  shouldSendPaymentFailedOnTransition,
} from '../../../server/utils/dodoSubscriptionStatus';

describe('dodoSubscriptionStatus', () => {
  describe('normalizeDodoSubscriptionStatus', () => {
    it('normalizes past-due variants', () => {
      expect(normalizeDodoSubscriptionStatus('past-due')).toBe('past_due');
    });
  });

  describe('shouldSendPaymentFailedOnTransition', () => {
    it('is true when entering past_due from active', () => {
      expect(shouldSendPaymentFailedOnTransition('active', 'past_due')).toBe(true);
    });

    it('is false when status unchanged past_due', () => {
      expect(shouldSendPaymentFailedOnTransition('past_due', 'past_due')).toBe(false);
    });

    it('is false for active to active', () => {
      expect(shouldSendPaymentFailedOnTransition('active', 'active')).toBe(false);
    });
  });
});
