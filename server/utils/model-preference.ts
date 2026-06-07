import { WHITELIST } from '../config/constants.js';
import { getWhitelistSelectableModels } from '../config/model-catalog.js';
import { isAutoModelPreference } from '../config/model-routing.js';
import { whitelistService } from '../services/whitelistService.js';

export class ModelPreferenceError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ModelPreferenceError';
  }
}

/**
 * Coerce client model_key to a server-safe preference.
 * Non-whitelist / kill-switch off → undefined (auto cascade).
 * Whitelist + invalid key → throws ModelPreferenceError (400).
 */
export function sanitizeModelPreference(
  email: string | null | undefined,
  modelKey: string | undefined | null,
): string | undefined {
  if (isAutoModelPreference(modelKey)) return undefined;
  if (!email || !whitelistService.isWhitelisted(email)) return undefined;
  if (!WHITELIST.SHOW_MODEL_SELECT_FOR_WHITELIST) return undefined;

  const allowed = new Set(getWhitelistSelectableModels().map((m) => m.key));
  if (!allowed.has(modelKey!)) {
    throw new ModelPreferenceError(`Unknown or disallowed model: ${modelKey}`);
  }
  return modelKey!;
}
