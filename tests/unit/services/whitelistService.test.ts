import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// Preserve original env
const savedBypassEmails = process.env.BYPASS_EMAILS;
const savedBypassLimit = process.env.BYPASS_USER_LIMIT;

describe('Whitelist Service - Unit Tests', () => {
  afterEach(() => {
    // Restore env
    if (savedBypassEmails !== undefined) {
      process.env.BYPASS_EMAILS = savedBypassEmails;
    } else {
      delete process.env.BYPASS_EMAILS;
    }
    if (savedBypassLimit !== undefined) {
      process.env.BYPASS_USER_LIMIT = savedBypassLimit;
    } else {
      delete process.env.BYPASS_USER_LIMIT;
    }
  });

  describe('isWhitelisted', () => {
    it('returns true for exact email match', async () => {
      process.env.BYPASS_EMAILS = 'admin@example.com';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('admin@example.com')).toBe(true);
    });

    it('is case-insensitive', async () => {
      process.env.BYPASS_EMAILS = 'admin@example.com';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('ADMIN@EXAMPLE.COM')).toBe(true);
      expect(whitelistService.isWhitelisted('Admin@Example.com')).toBe(true);
    });

    it('returns false for email not in list', async () => {
      process.env.BYPASS_EMAILS = 'admin@example.com';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('other@example.com')).toBe(false);
    });

    it('returns false for empty string', async () => {
      process.env.BYPASS_EMAILS = 'admin@example.com';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('')).toBe(false);
    });

    it('filters invalid emails from BYPASS_EMAILS env', async () => {
      process.env.BYPASS_EMAILS = 'notanemail,admin@example.com,alsoinvalid';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('notanemail')).toBe(false);
      expect(whitelistService.isWhitelisted('admin@example.com')).toBe(true);
    });

    it('returns false for all emails when BYPASS_EMAILS is empty', async () => {
      process.env.BYPASS_EMAILS = '';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('anyone@example.com')).toBe(false);
    });

    it('supports multiple emails in comma-separated list', async () => {
      process.env.BYPASS_EMAILS = 'a@x.com, b@y.com, c@z.com';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.isWhitelisted('a@x.com')).toBe(true);
      expect(whitelistService.isWhitelisted('b@y.com')).toBe(true);
      expect(whitelistService.isWhitelisted('c@z.com')).toBe(true);
    });
  });

  describe('getBypassLimit', () => {
    it('returns 10000 by default when env var not set', async () => {
      delete process.env.BYPASS_USER_LIMIT;
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.getBypassLimit()).toBe(10000);
    });

    it('returns configured value when valid positive number', async () => {
      process.env.BYPASS_USER_LIMIT = '500';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.getBypassLimit()).toBe(500);
    });

    it('returns 10000 fallback when value is 0', async () => {
      process.env.BYPASS_USER_LIMIT = '0';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.getBypassLimit()).toBe(10000);
    });

    it('returns 10000 fallback when value is negative', async () => {
      process.env.BYPASS_USER_LIMIT = '-5';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.getBypassLimit()).toBe(10000);
    });

    it('returns 10000 fallback when value is non-numeric', async () => {
      process.env.BYPASS_USER_LIMIT = 'abc';
      vi.resetModules();
      const { whitelistService } = await import('../../../server/services/whitelistService');

      expect(whitelistService.getBypassLimit()).toBe(10000);
    });
  });

  describe('getUpgradeMessage', () => {
    beforeEach(async () => {
      vi.resetModules();
    });

    it('returns empty string for whitelisted users', async () => {
      const { whitelistService } = await import('../../../server/services/whitelistService');
      expect(whitelistService.getUpgradeMessage(true, 5, 10)).toBe('');
    });

    it('returns exhausted message when used >= limit', async () => {
      const { whitelistService } = await import('../../../server/services/whitelistService');
      const msg = whitelistService.getUpgradeMessage(false, 10, 10);
      expect(msg).toContain('used all your credits');
    });

    it('returns low credits warning when remaining <= threshold (10)', async () => {
      const { whitelistService } = await import('../../../server/services/whitelistService');
      const msg = whitelistService.getUpgradeMessage(false, 9, 10);
      expect(msg).toContain('1 credits left');
    });

    it('returns empty string when plenty of credits remain', async () => {
      const { whitelistService } = await import('../../../server/services/whitelistService');
      expect(whitelistService.getUpgradeMessage(false, 1, 100)).toBe('');
    });
  });
});
