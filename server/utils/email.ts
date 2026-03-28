/**
 * Backward-compat re-exports — new code should import from emailService directly.
 * These thin wrappers exist only so existing call sites in routes.ts continue
 * to work during the transition.
 */
export { sendWelcome as sendWelcomeEmail } from '../services/emailService.js';

// sendPasswordResetEmail(toEmail, token) — legacy signature adapted to emailService
import { sendPasswordReset } from '../services/emailService.js';
import { storage } from '../storage.js';

export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
  const user = await storage.getUserByEmail(toEmail);
  if (!user) {
    console.warn('[email] sendPasswordResetEmail: user not found for', toEmail);
    return;
  }
  await sendPasswordReset(user.id, token);
}
