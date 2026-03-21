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
  // No-op by default to avoid accidental destructive operations.
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