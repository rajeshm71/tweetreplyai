import { createClient } from '@supabase/supabase-js';

// Validate required environment variables
if (!process.env.SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error('SUPABASE_ANON_KEY environment variable is required');
}

console.log('=== SUPABASE CLIENT INITIALIZATION ===');
console.log('SUPABASE_URL:', process.env.SUPABASE_URL);
console.log('SUPABASE_ANON_KEY configured:', !!process.env.SUPABASE_ANON_KEY);

// Create Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false, // Don't persist sessions in serverless
    },
  }
);

console.log('Supabase client initialized successfully');

