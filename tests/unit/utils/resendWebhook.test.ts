import { describe, it, expect } from 'vitest';
import {
  getIdempotencyKeyFromResendWebhookData,
  getRecipientEmailFromResendWebhookData,
} from '../../../server/utils/resendWebhook';

/** Shape from https://resend.com/docs/webhooks/emails/delivered */
const officialDeliveredData = {
  broadcast_id: '8b146471-e88e-4322-86af-016cd36fd216',
  created_at: '2024-02-22T23:41:11.894719+00:00',
  email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
  from: 'Acme <onboarding@resend.dev>',
  to: ['delivered@resend.dev'],
  subject: 'Sending this example',
  template_id: '43f68331-0622-4e15-8202-246a0388854b',
  tags: {
    category: 'confirm_email',
  },
};

describe('resendWebhook helpers', () => {
  describe('getIdempotencyKeyFromResendWebhookData', () => {
    it('reads idempotency_key from object-shaped tags (Resend docs)', () => {
      expect(
        getIdempotencyKeyFromResendWebhookData({
          tags: { idempotency_key: 'welcome:user-1' },
        })
      ).toBe('welcome:user-1');
    });

    it('returns undefined when tag missing in object', () => {
      expect(getIdempotencyKeyFromResendWebhookData(officialDeliveredData)).toBeUndefined();
    });

    it('supports legacy array-shaped tags', () => {
      expect(
        getIdempotencyKeyFromResendWebhookData({
          tags: [{ name: 'idempotency_key', value: 'legacy-key' }],
        })
      ).toBe('legacy-key');
    });

    it('returns undefined for empty/missing tags', () => {
      expect(getIdempotencyKeyFromResendWebhookData({})).toBeUndefined();
      expect(getIdempotencyKeyFromResendWebhookData({ tags: null as unknown as undefined })).toBeUndefined();
    });
  });

  describe('getRecipientEmailFromResendWebhookData', () => {
    it('uses first element when to is array (Resend docs)', () => {
      expect(getRecipientEmailFromResendWebhookData(officialDeliveredData)).toBe('delivered@resend.dev');
    });

    it('supports string to', () => {
      expect(getRecipientEmailFromResendWebhookData({ to: 'single@example.com' })).toBe('single@example.com');
    });

    it('returns undefined for empty array', () => {
      expect(getRecipientEmailFromResendWebhookData({ to: [] })).toBeUndefined();
    });
  });
});
