import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WHITELIST } from '../../../server/config/constants';

vi.mock('../../../server/services/whitelistService.js', () => ({
  whitelistService: {
    isWhitelisted: vi.fn(),
  },
}));

describe('sanitizeModelPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = true;
  });

  it('returns undefined for auto aliases', async () => {
    const { sanitizeModelPreference } = await import('../../../server/utils/model-preference');
    const { whitelistService } = await import('../../../server/services/whitelistService');
    vi.mocked(whitelistService.isWhitelisted).mockReturnValue(true);

    expect(sanitizeModelPreference('a@b.com', 'auto')).toBeUndefined();
    expect(sanitizeModelPreference('a@b.com', '')).toBeUndefined();
    expect(sanitizeModelPreference('a@b.com', undefined)).toBeUndefined();
  });

  it('strips model for non-whitelist users', async () => {
    const { sanitizeModelPreference } = await import('../../../server/utils/model-preference');
    const { whitelistService } = await import('../../../server/services/whitelistService');
    vi.mocked(whitelistService.isWhitelisted).mockReturnValue(false);

    expect(sanitizeModelPreference('a@b.com', 'gpt-4.1-mini')).toBeUndefined();
  });

  it('strips model when kill switch is off', async () => {
    const { sanitizeModelPreference } = await import('../../../server/utils/model-preference');
    const { whitelistService } = await import('../../../server/services/whitelistService');
    vi.mocked(whitelistService.isWhitelisted).mockReturnValue(true);
    (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = false;

    expect(sanitizeModelPreference('a@b.com', 'gpt-4.1-mini')).toBeUndefined();
  });

  it('returns explicit model for whitelisted user when allowed', async () => {
    const { sanitizeModelPreference } = await import('../../../server/utils/model-preference');
    const { whitelistService } = await import('../../../server/services/whitelistService');
    vi.mocked(whitelistService.isWhitelisted).mockReturnValue(true);
    (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = true;

    expect(sanitizeModelPreference('a@b.com', 'gpt-4.1-mini')).toBe('gpt-4.1-mini');
  });

  it('throws for unknown whitelist model', async () => {
    const { sanitizeModelPreference, ModelPreferenceError } = await import(
      '../../../server/utils/model-preference'
    );
    const { whitelistService } = await import('../../../server/services/whitelistService');
    vi.mocked(whitelistService.isWhitelisted).mockReturnValue(true);
    (WHITELIST as { SHOW_MODEL_SELECT_FOR_WHITELIST: boolean }).SHOW_MODEL_SELECT_FOR_WHITELIST = true;

    expect(() => sanitizeModelPreference('a@b.com', 'not-a-real-model')).toThrow(ModelPreferenceError);
  });
});
