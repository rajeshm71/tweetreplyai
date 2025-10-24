import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "../shared/schema.js";

if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'test') {
    // For tests, we'll use mocked database operations
    console.log('Running in test mode - database operations will be mocked');
  } else {
    console.warn('DATABASE_URL not set - database operations will be unavailable');
  }
}

// Create postgres connection for Supabase
// Note: Supabase recommends using pooled connection (port 6543) for serverless
let queryClient: any;
let db: any;

if (process.env.DATABASE_URL) {
  // Convert direct connection URL to pooled connection URL for serverless
  let connectionUrl = process.env.DATABASE_URL;
  
  console.log('=== DATABASE_URL DEBUG ===');
  console.log('Original DATABASE_URL:', connectionUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials
  console.log('Contains port 5432:', connectionUrl.includes(':5432'));
  console.log('Contains port 6543:', connectionUrl.includes(':6543'));
  console.log('Contains pooler:', connectionUrl.includes('pooler'));
  console.log('Contains aws-0:', connectionUrl.includes('aws-0'));
  
  // If it's a direct connection (port 5432), convert to pooled (port 6543)
  if (connectionUrl.includes(':5432')) {
    connectionUrl = connectionUrl.replace(':5432', ':6543');
    console.log('Converted to pooled connection URL for serverless');
    console.log('Converted URL:', connectionUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials
  }
  
  console.log('Final connection URL:', connectionUrl.replace(/\/\/.*@/, '//***:***@')); // Hide credentials in logs
  
  queryClient = postgres(connectionUrl, {
    max: 5, // Reduce max connections for serverless
    idle_timeout: 30, // Keep connections alive longer
    connect_timeout: 30, // Increase connection timeout
    max_lifetime: 60 * 30, // 30 minutes max lifetime
    prepare: false, // Disable prepared statements for serverless
  });
  db = drizzle(queryClient, { schema });
} else {
  // For test mode without DATABASE_URL, create a mock db
  db = null;
}

export { db };