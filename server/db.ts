import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "../shared/schema.js";

// Lazy-loaded database connection
let queryClient: any;
let dbInstance: any;
let isInitialized = false;

function initializeDatabase() {
  if (isInitialized) {
    return dbInstance;
  }
  
  console.log('=== INITIALIZING DATABASE CONNECTION ===');
  console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
  console.log('SUPABASE_URL configured:', !!process.env.SUPABASE_URL);
  console.log('SESSION_SECRET configured:', !!process.env.SESSION_SECRET);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  if (!process.env.DATABASE_URL) {
    if (process.env.NODE_ENV === 'test') {
      console.log('Running in test mode - database operations will be mocked');
    } else {
      console.warn('DATABASE_URL not set - database operations will be unavailable');
    }
    dbInstance = null;
    isInitialized = true;
    return dbInstance;
  }

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
  dbInstance = drizzle(queryClient, { schema });
  isInitialized = true;
  
  console.log('Database connection initialized successfully');
  return dbInstance;
}

// Export a getter that initializes the database on first access
export const db = new Proxy({} as any, {
  get(target, prop) {
    const instance = initializeDatabase();
    return instance ? instance[prop] : undefined;
  }
});