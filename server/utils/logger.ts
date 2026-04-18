/**
 * Lightweight structured logger.
 *
 * Emits newline-delimited JSON so Vercel / Papertrail / Better Stack can parse
 * each line as a discrete event. Falls back to pretty console output in dev.
 *
 * Usage:
 *   import { logger } from './utils/logger';
 *   logger.info('user.created', { userId });
 *   logger.error('dodo.webhook.invalid_signature', { eventType });
 *
 * Do NOT log raw tokens, cookies, or request bodies. Use `redactForLogs`
 * from `./logging` for anything derived from user input.
 */

import { redactForLogs } from './logging.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function parseLevel(): Level {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase();
  if (raw in LEVEL_ORDER) return raw as Level;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

const currentLevel = parseLevel();
const isStructured = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  const record: Record<string, unknown> = {
    level,
    event,
    ts: new Date().toISOString(),
  };
  if (fields) {
    try {
      Object.assign(record, redactForLogs(fields) as Record<string, unknown>);
    } catch {
      record.fields = '[unserializable]';
    }
  }

  if (isStructured) {
    const line = JSON.stringify(record);
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }

  const prefix = `[${level.toUpperCase()}] ${event}`;
  if (fields) {
    if (level === 'error') console.error(prefix, fields);
    else if (level === 'warn') console.warn(prefix, fields);
    else console.log(prefix, fields);
  } else if (level === 'error') console.error(prefix);
  else if (level === 'warn') console.warn(prefix);
  else console.log(prefix);
}

export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => emit('debug', event, fields),
  info: (event: string, fields?: Record<string, unknown>) => emit('info', event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => emit('warn', event, fields),
  error: (event: string, fields?: Record<string, unknown>) => emit('error', event, fields),
};
