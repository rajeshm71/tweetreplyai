/**
 * Process-level crash handlers.
 *
 * Registers handlers for `unhandledRejection` and `uncaughtException` so async
 * failures outside Express' error middleware are logged consistently instead of
 * silently crashing the worker. Idempotent: calling `registerCrashHandlers`
 * multiple times in a single process is safe.
 *
 * On Vercel's serverless runtime these events can still fire on the Node
 * worker; the cost of registering them is effectively zero and they give us a
 * last-chance log line before the worker is recycled.
 */

let registered = false;

async function reportToSentry(err: unknown, level: 'error' | 'fatal'): Promise<void> {
  try {
    const Sentry = await import('@sentry/node');
    Sentry.captureException(err, { level });
    await Sentry.flush(2000);
  } catch {
    // Sentry not initialized / not installed; ignore.
  }
}

export function registerCrashHandlers(): void {
  if (registered) return;
  registered = true;

  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('[CrashHandler] unhandledRejection', {
      reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
      promise: String(promise),
    });
    void reportToSentry(reason, 'error');
    // Intentionally do NOT exit: express handlers and caller code can still run.
  });

  process.on('uncaughtException', (err: Error) => {
    console.error('[CrashHandler] uncaughtException', {
      message: err?.message,
      stack: err?.stack,
    });
    void reportToSentry(err, 'fatal');
    // Defensive: give logs a tick to flush, then exit so a supervisor restarts
    // us with a clean process state. Vercel recycles the worker on its own.
    setTimeout(() => {
      if (process.env.NODE_ENV === 'production' && !process.env.VERCEL) {
        process.exit(1);
      }
    }, 250).unref?.();
  });
}
