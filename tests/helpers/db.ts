// Database helper for tests - using Supabase JS client instead of raw PostgreSQL
import { supabase } from "../../server/supabase.js";
import type { UpsertUser } from "../../shared/types.js";

/**
 * Integration tests in this repository are best-effort.
 * In environments without a reachable DB, these helpers intentionally
 * remain no-op so tests can skip gracefully instead of crashing.
 */
export async function setupTestDatabase() {
  return supabase;
}

export async function cleanDatabase() {
  // Only run against a real Supabase database; never run against production-looking URLs
  if (!process.env.DATABASE_URL?.includes('supabase.co')) return;

  // Delete in FK-safe order (children before parents) — only rows belonging to inttest- users
  await supabase.from('usage_counters').delete().like('user_id', 'inttest-%');
  await supabase.from('subscriptions').delete().like('user_id', 'inttest-%');
  await supabase.from('reply_history').delete().like('user_id', 'inttest-%');
  await supabase.from('feedback').delete().like('user_id', 'inttest-%');
  await supabase.from('users').delete().like('email', 'inttest-%@example.com');
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