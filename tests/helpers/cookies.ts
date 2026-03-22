/**
 * Build a single `Cookie` header value from Express `Set-Cookie` (string or string[]).
 */
export function cookieHeaderFromSetCookie(
  setCookie: string | string[] | undefined
): string | undefined {
  if (setCookie == null) return undefined;
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  if (parts.length === 0) return undefined;
  return parts.map((c) => c.split(";")[0]).join("; ");
}
