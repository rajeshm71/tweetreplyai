import { createClient } from '@supabase/supabase-js';

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}

// Prefer service_role key (bypasses RLS). Require it in production.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (isProduction && !serviceRoleKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required in production (RLS is enabled on all tables)');
}

const key = serviceRoleKey || anonKey;
if (!key) {
  throw new Error('Either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY must be set');
}

// Safe logging: never log URL or key values
console.log('Supabase client:', serviceRoleKey ? 'initialized with service_role' : 'initialized with anon key');

export const supabase = createClient(process.env.SUPABASE_URL!, key, {
  auth: {
    persistSession: false, // Don't persist sessions in serverless
  },
});

