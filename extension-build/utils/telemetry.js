import { DEFAULTS } from '../config/constants.js';

const ALLOWED_EVENT_TYPES = new Set([
  'auth_sync_failed',
  'api_request_failed',
  'api_timeout',
  'rate_limited',
  'credits_exhausted',
  'composer_injection_failed',
  'reply_insert_failed',
  'storage_read_failed',
  'storage_write_failed',
  'unknown_runtime_error',
  // Reuse / Reframe tweet feature
  'reuse_open',
  'reuse_generate_success',
  'reuse_generate_error',
  'reuse_post_to_compose',
  'reuse_post_to_compose_timeout',
]);

const ALLOWED_SURFACES = new Set(['content', 'popup', 'background']);

const dedupeMap = new Map();

function toSafeString(value, max = 200) {
  if (value === null || value === undefined) return '';
  const v = String(value);
  return v.length > max ? `${v.slice(0, max)}...` : v;
}

export function normalizeTelemetryEvent(raw = {}) {
  const eventType = ALLOWED_EVENT_TYPES.has(raw.event_type)
    ? raw.event_type
    : 'unknown_runtime_error';
  const surface = ALLOWED_SURFACES.has(raw.surface) ? raw.surface : 'background';
  const extensionVersion = chrome.runtime?.getManifest?.()?.version || 'unknown';

  return {
    event_type: eventType,
    timestamp: raw.timestamp || new Date().toISOString(),
    extension_version: extensionVersion,
    surface,
    route: toSafeString(raw.route, 120),
    http_status: Number.isFinite(Number(raw.http_status)) ? Number(raw.http_status) : null,
    error_code: toSafeString(raw.error_code, 120),
    context: {
      model_key: toSafeString(raw?.context?.model_key, 80),
      reply_mode: toSafeString(raw?.context?.reply_mode, 80),
      prompt_key: toSafeString(raw?.context?.prompt_key, 80),
      action: toSafeString(raw?.context?.action, 80),
      note: toSafeString(raw?.context?.note, 160),
    },
  };
}

export function shouldDedupeEvent(event) {
  const key = [
    event.event_type,
    event.surface,
    event.route || '',
    event.http_status || '',
    event.error_code || '',
  ].join('|');
  const now = Date.now();
  const prev = dedupeMap.get(key);
  if (prev && now - prev < DEFAULTS.TELEMETRY_DEDUPE_WINDOW_MS) return true;
  dedupeMap.set(key, now);
  return false;
}

export function emitTelemetry(rawEvent) {
  try {
    const event = normalizeTelemetryEvent(rawEvent);
    if (shouldDedupeEvent(event)) return;
    chrome.runtime.sendMessage({ action: 'telemetryEvent', event }).catch?.(() => {});
  } catch {
    // never crash user flows due to telemetry
  }
}

