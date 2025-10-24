// This file is deprecated - we now use Supabase JS client instead of raw PostgreSQL
// All database operations should go through server/storage-supabase.ts

console.warn('server/db.ts is deprecated. Use Supabase JS client through server/storage-supabase.ts instead.');

// Export a dummy object to prevent import errors
export const db = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => [] }) }) }),
  insert: () => ({ values: () => ({ returning: () => [] }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: () => [] }) }) }),
  delete: () => ({ where: () => ({ returning: () => [] }) })
};