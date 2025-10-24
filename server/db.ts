import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from "../shared/schema.js";

// Lazy-loaded database connection
let queryClient: any;
let dbInstance: any;
let isInitialized = false;

function maskConnectionString(url: string): string {
  try {
    return url.replace(/\/\/.*@/, '//***:***@');
  } catch (_) {
    return url;
  }
}

function normalizeDatabaseUrl(rawUrl: string): string {
  let url = rawUrl;
  // Ensure postgres scheme is consistent
  if (url.startsWith('postgresql://')) {
    url = 'postgres://' + url.slice('postgresql://'.length);
  }
  // Prefer pooled port 6543 over 5432 for serverless
  if (url.includes(':5432')) {
    url = url.replace(':5432', ':6543');
  }
  // Ensure sslmode=require is present
  if (!/sslmode=/.test(url)) {
    url += (url.includes('?') ? '&' : '?') + 'sslmode=require';
  }
  return url;
}

function initializeDatabase() {
  if (isInitialized) {
    return dbInstance;
  }
  
  console.log('=== INITIALIZING DATABASE CONNECTION ===');
  console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
  console.log('SUPABASE_URL configured:', !!process.env.SUPABASE_URL);
  console.log('SESSION_SECRET configured:', !!process.env.SESSION_SECRET);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  
  // Force error if DATABASE_URL is not set
  if (!process.env.DATABASE_URL) {
    console.error('CRITICAL ERROR: DATABASE_URL is not set!');
    console.error('All environment variables:', Object.keys(process.env));
    throw new Error('DATABASE_URL environment variable is required but not set');
  }

  // Normalize connection URL for serverless
  let connectionUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);
  
  console.log('=== DATABASE_URL DEBUG ===');
  console.log('Original DATABASE_URL:', maskConnectionString(process.env.DATABASE_URL));
  console.log('Contains port 5432:', connectionUrl.includes(':5432'));
  console.log('Contains port 6543:', connectionUrl.includes(':6543'));
  console.log('Contains pooler:', connectionUrl.includes('pooler'));
  console.log('Contains aws-0:', connectionUrl.includes('aws-0'));
  
  // If it's a direct connection (port 5432), convert to pooled (port 6543)
  // Already normalized above
  
  console.log('Final connection URL:', maskConnectionString(connectionUrl)); // Hide credentials in logs
  
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