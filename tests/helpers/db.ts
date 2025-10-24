// Database helper for tests - using Supabase JS client instead of raw PostgreSQL
import { supabase } from '../../server/supabase.js';

export async function setupTestDatabase() {
  // No setup needed for Supabase JS client
  console.log('Test database setup complete (using Supabase JS client)');
}

export async function cleanupTestDatabase() {
  // Clean up test data if needed
  console.log('Test database cleanup complete');
}

export function getTestDb() {
  return supabase;
}