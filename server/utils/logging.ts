type AnyRecord = Record<string, unknown>;

const SENSITIVE_KEY_IDENTIFIERS = [
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "authorization",
  "cookie",
  "session",
  "jwt",
] as const;

const isSensitiveKey = (key: string): boolean => {
  const lower = key.toLowerCase();

  // Match exact keys and common suffixes (e.g. "refresh_token", "accessToken").
  return SENSITIVE_KEY_IDENTIFIERS.some(
    (identifier) => lower === identifier || lower.endsWith(identifier)
  );
};

const MAX_RECURSION_DEPTH = 5;
const MAX_ARRAY_LENGTH = 50;

export const redactForLogs = (value: unknown, depth = 0, seen = new WeakSet<object>()): unknown => {
  // Hard stop for deeply nested structures to keep logging bounded.
  if (depth > MAX_RECURSION_DEPTH) return "[TRUNCATED]";

  if (value === null) return null;

  const t = typeof value;
  if (t !== "object") return value;

  // Circular reference guard.
  if (seen.has(value as object)) return "[CIRCULAR]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    const slice = value.slice(0, MAX_ARRAY_LENGTH).map((v) =>
      redactForLogs(v, depth + 1, seen)
    );
    if (value.length > MAX_ARRAY_LENGTH) slice.push("[TRUNCATED]");
    return slice;
  }

  const obj = value as AnyRecord;
  const out: AnyRecord = {};

  for (const [k, v] of Object.entries(obj)) {
    if (isSensitiveKey(k)) {
      out[k] = "[REDACTED]";
      continue;
    }

    out[k] = redactForLogs(v, depth + 1, seen);
  }

  return out;
};

export const safeStringifyForLogs = (value: unknown, maxLen: number): string => {
  try {
    const json = JSON.stringify(
      value,
      (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    );

    const str = typeof json === "string" ? json : String(json);
    if (!Number.isFinite(maxLen) || maxLen <= 0) return str;

    if (str.length <= maxLen) return str;
    return str.slice(0, Math.max(0, maxLen - 1)) + "…";
  } catch {
    return "[UNLOGGABLE]";
  }
};

