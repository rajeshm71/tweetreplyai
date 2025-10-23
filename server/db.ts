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
    max: 10, // Maximum number of connections
    idle_timeout: 20, // Close idle connections after 20s
    connect_timeout: 10, // Connection timeout in seconds
  });
  db = drizzle(queryClient, { schema });
} else {
  // For test mode without SUPABASE_URL, create a mock db
  db = null;
}

export { db };