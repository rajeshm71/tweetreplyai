import { useEffect, useState } from "react";
import { Link } from "wouter";

const STORAGE_KEY = "cookieConsent";
type Choice = "accepted" | "rejected";

function readChoice(): Choice | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "accepted" || v === "rejected") return v;
  } catch {
    // localStorage disabled; treat as "no choice yet" but don't pester.
    return "rejected";
  }
  return null;
}

function writeChoice(choice: Choice): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // ignore
  }
}

/**
 * Minimal, non-modal cookie banner. Renders once until the user makes a
 * choice. We do not load analytics / third-party cookies at all today, so this
 * is currently informational + future-proofing for any analytics we add.
 */
export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (readChoice() === null) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = (choice: Choice) => {
    writeChoice(choice);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie notice"
      className="fixed inset-x-2 bottom-2 z-50 mx-auto max-w-3xl rounded-lg border border-border bg-card/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 md:inset-x-4 md:bottom-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-card-foreground">
          We use essential cookies to keep you signed in. By clicking
          &ldquo;Accept&rdquo; you agree to our use of optional cookies for product
          analytics. See our{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => dismiss("rejected")}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
          >
            Reject optional
          </button>
          <button
            type="button"
            onClick={() => dismiss("accepted")}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
