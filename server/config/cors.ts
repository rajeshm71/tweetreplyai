/**
 * CORS allow-list for /api. Supports exact origins and domain patterns like *.tweetreplyai.com in CORS_ORIGINS.
 */

const BUILTIN_ORIGINS = [
  'https://tweetreplyai.vercel.app',
  'http://localhost:5000',
  'http://localhost:5173',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5173',
] as const;

const exactOrigins = new Set<string>(BUILTIN_ORIGINS);
const domainPatterns: string[] = [];

function parseCorsOrigins() {
  const env = process.env.CORS_ORIGINS;
  if (!env) return;
  env.split(',').forEach((o) => {
    const trimmed = o.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('*.')) {
      const domain = trimmed.slice(2).toLowerCase();
      if (domain && !domainPatterns.includes(domain)) domainPatterns.push(domain);
    } else {
      exactOrigins.add(trimmed);
    }
  });
}

parseCorsOrigins();

function originMatchesDomainPattern(origin: string, domain: string): boolean {
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return hostname === domain || hostname.endsWith('.' + domain);
  } catch {
    return false;
  }
}

export const corsApiOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) {
    if (!origin) {
      callback(null, true);
      return;
    }
    if (exactOrigins.has(origin) || origin.startsWith('chrome-extension://')) {
      callback(null, origin);
      return;
    }
    if (domainPatterns.some((domain) => originMatchesDomainPattern(origin, domain))) {
      callback(null, origin);
      return;
    }
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
