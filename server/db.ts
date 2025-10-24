import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "../shared/schema.js";

if (!process.env.SUPABASE_URL) {
  if (process.env.NODE_ENV === 'test') {
    // For tests, we'll use mocked database operations
    console.log('Running in test mode - database operations will be mocked');
  } else {
    console.warn('SUPABASE_URL not set - database operations will be unavailable');
  }
}

// Create postgres connection for Supabase
// Note: Supabase recommends using pooled connection (port 6543)
let queryClient: any;
let db: any;

if (process.env.SUPABASE_URL) {
  queryClient = postgres(process.env.SUPABASE_URL, {
    max: 5, // Reduce max connections for serverless
    idle_timeout: 30, // Keep connections alive longer
    connect_timeout: 30, // Increase connection timeout
    max_lifetime: 60 * 30, // 30 minutes max lifetime
    prepare: false, // Disable prepared statements for serverless
  });
  db = drizzle(queryClient, { schema });
} else {
  // For test mode without SUPABASE_URL, create a mock db
  db = null;
}

export { db };