import { useEffect, useState } from "react";

/**
 * Non-blocking banner that appears when the browser reports it's offline.
 * Uses navigator.onLine plus online/offline events; disappears immediately
 * when connectivity returns.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-2 pt-2"
    >
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive shadow-sm">
        You appear to be offline. Some features may not work until your
        connection returns.
      </div>
    </div>
  );
}
