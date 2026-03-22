import { hashPassword } from "../../server/utils/password.js";
import { storage } from "../../server/storage.js";
import type { InsertSubscription, InsertUsageCounter, UpsertUser } from "../../shared/types.js";
import crypto from "crypto";
import { supabase } from "../../server/supabase.js";

export type SeedInttestUserOptions = {
  id: string;
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  authProviders?: string[];
  hasUsedTrial?: boolean;
};

/**
 * Insert or update a user row so JWT `id` / `email` match `storage.getUser` (integration assertions).
 */
export async function seedInttestUser(opts: SeedInttestUserOptions) {
  const payload: UpsertUser = {
    id: opts.id,
    email: opts.email,
    firstName: opts.firstName ?? "Inttest",
    lastName: opts.lastName ?? "User",
    authProviders: opts.authProviders ?? ["password"],
    hasUsedTrial: opts.hasUsedTrial ?? false,
  };
  if (opts.password) {
    payload.password = await hashPassword(opts.password);
  }
  return storage.upsertUser(payload);
}

/**
 * Delete one integration user and dependent rows (FK-safe order). Prefer `cleanDatabase()` for full sweep.
 */
export async function deleteInttestUserById(userId: string) {
  if (!process.env.DATABASE_URL?.includes("supabase.co")) return;

  const { data: ev } = await supabase.from("reply_events").select("id").eq("user_id", userId);
  const eventIds = (ev ?? []).map((e: { id: string | number }) => String(e.id));
  if (eventIds.length > 0) {
    await supabase.from("feedback").delete().in("reply_event_id", eventIds);
  }
  await supabase.from("reply_tokens").delete().eq("user_id", userId);
  await supabase.from("reply_history").delete().eq("user_id", userId);
  await supabase.from("reply_events").delete().eq("user_id", userId);
  await supabase.from("usage_counters").delete().eq("user_id", userId);
  await supabase.from("subscriptions").delete().eq("user_id", userId);
  await supabase.from("user_preferences").delete().eq("user_id", userId);
  await supabase.from("users").delete().eq("id", userId);
}

/** Trial counter aligned with app trial window (7-day period). */
export async function seedTrialUsageCounter(userId: string, overrides: Partial<InsertUsageCounter> = {}) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodEnd.getDate() + 7);

  const row: InsertUsageCounter = {
    id: crypto.randomUUID(),
    userId,
    planCode: "trial",
    periodStart,
    periodEnd,
    repliesUsed: overrides.repliesUsed ?? 0,
    creditsUsed: overrides.creditsUsed ?? 0,
    limit: overrides.limit ?? 100,
    resetAt: overrides.resetAt ?? periodEnd,
    ...overrides,
  };
  return storage.createUsageCounter(row);
}

export async function seedSubscription(row: InsertSubscription) {
  return storage.createSubscription(row);
}
