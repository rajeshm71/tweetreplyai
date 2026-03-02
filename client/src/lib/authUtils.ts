export function isUnauthorizedError(error: Error): boolean {
  const msg = error.message || "";
  return /^401: .*Unauthorized/.test(msg) || msg === "Unauthorized" || /Unauthorized/i.test(msg);
}