// Database helper for tests - using Supabase JS client instead of raw PostgreSQL
import { supabase } from "../../server/supabase.js";
import type { UpsertUser } from "../../shared/types.js";
import { STATIC_INTEST_USER_IDS } from "./inttest-constants";

/**
 * Integration tests in this repository are best-effort.
 * In environments without a reachable DB, these helpers intentionally
 * remain no-op so tests can skip gracefully instead of crashing.
 */
export async function setupTestDatabase() {
  return supabase;
}

async function collectInttestUserIds(): Promise<string[]> {
  const { data: emailUsers } = await supabase
    .from("users")
    .select("id")
    .like("email", "inttest-%@example.com");

  const fromEmails = (emailUsers ?? []).map((u: { id: string }) => u.id);
  return [...new Set([...STATIC_INTEST_USER_IDS, ...fromEmails])];
}

export async function cleanDatabase() {
  // Only run against a real Supabase database; never run against production-looking URLs
  if (!process.env.DATABASE_URL?.includes("supabase.co")) return;

  const userIds = await collectInttestUserIds();
  if (userIds.length === 0) return;

  // FK-safe order: children before parents
  const { data: events } = await supabase.from("reply_events").select("id").in("user_id", userIds);
  const eventIds = (events ?? []).map((e: { id: string | number }) => String(e.id));
  if (eventIds.length > 0) {
    await supabase.from("feedback").delete().in("reply_event_id", eventIds);
  }

  await supabase.from("reply_tokens").delete().in("user_id", userIds);
  await supabase.from("reply_history").delete().in("user_id", userIds);
  await supabase.from("reply_events").delete().in("user_id", userIds);
  await supabase.from("usage_counters").delete().in("user_id", userIds);
  await supabase.from("subscriptions").delete().in("user_id", userIds);
  await supabase.from("user_preferences").delete().in("user_id", userIds);

  await supabase.from("users").delete().like("email", "inttest-%@example.com");
  await supabase.from("users").delete().in("id", STATIC_INTEST_USER_IDS);
}

export async function closeTestDatabase() {
  // Supabase JS client does not require explicit shutdown.
}

export async function cleanupTestDatabase() {
  await cleanDatabase();
}

export function getTestDb() {
  return supabase;
}

export async function createTestUser(user: Partial<UpsertUser> = {}) {
  return {
    id: user.id ?? `test-user-${Date.now()}`,
    email: user.email ?? `test-${Date.now()}@example.com`,
    firstName: user.firstName ?? "Test",
    lastName: user.lastName ?? "User",
    ...user,
  };
}
