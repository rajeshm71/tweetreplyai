import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Sentry } from "./sentry";

/**
 * Report React Query failures to Sentry only for "important" errors:
 * - VITE_SENTRY_DSN must be set (otherwise no-op).
 * - HTTP status missing (network / parse) or status >= 500.
 * Skips every 4xx (401/402/403/404/429/…), not only a subset — avoids auth,
 * quota, not-found, and rate-limit noise in Sentry.
 * Never attach response bodies — only a short queryKey preview tag.
 */
function shouldReportQueryErrorToSentry(error: unknown): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim?.();
  if (!dsn) return false;
  const status = (error as Error & { status?: number })?.status;
  if (status === undefined || status === null || Number.isNaN(Number(status))) return true;
  if (status >= 500) return true;
  return false;
}

function captureQueryError(
  error: unknown,
  meta: { queryKey?: readonly unknown[]; source: "query" | "mutation" },
): void {
  if (!shouldReportQueryErrorToSentry(error)) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag("react_query", meta.source);
      const preview = meta.queryKey?.length
        ? meta.queryKey
            .slice(0, 3)
            .map((k) => String(k).slice(0, 40))
            .join("|")
            .slice(0, 120)
        : "unknown";
      scope.setTag("query_key_preview", preview);
      const ex = error instanceof Error ? error : new Error(String(error));
      Sentry.captureException(ex);
    });
  } catch {
    /* never break UI */
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    let message: string = `${res.status}: ${text}`;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json") && text.trim()) {
      try {
        const data = JSON.parse(text) as { message?: string; error?: string };
        if (typeof data?.message === "string" && data.message.trim()) message = data.message.trim();
        else if (typeof data?.error === "string" && data.error.trim()) message = data.error.trim();
      } catch {
        /* keep message as status: text */
      }
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
      onError: (error, query) => {
        captureQueryError(error, { queryKey: query.queryKey, source: "query" });
      },
    },
    mutations: {
      retry: false,
      onError: (error, _variables, _context, mutation) => {
        captureQueryError(error, {
          queryKey: mutation.options.mutationKey,
          source: "mutation",
        });
      },
    },
  },
});
