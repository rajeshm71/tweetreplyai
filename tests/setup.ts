import { config } from 'dotenv';
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

// Load test environment variables
config({ path: '.env.test' });

// Ensure Supabase module initialization doesn't throw during tests.
// Some unit tests don't require a real DB connection, but the client is imported at module load time.
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'http://localhost:54321';
}
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
}

// Set test environment variables if .env.test doesn't exist
if (!process.env.DATABASE_URL) {
  // For unit tests, we don't need a real database connection
  // Integration tests will require a real Supabase DATABASE_URL
  process.env.SESSION_SECRET = 'test-secret-key-for-testing-only';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.STRIPE_SECRET_KEY = 'sk_test_51234567890abcdef';
  process.env.OPENAI_API_KEY = 'test-openai-key-12345';
  process.env.GROQ_API_KEY = 'test-groq-key-54321';
  process.env.NODE_ENV = 'test';
  process.env.PORT = '5001';
  process.env.REPLIT_DOMAINS = 'test-replit-domain';
}

// Setup MSW server for API mocking
const server = setupServer(...handlers);

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});

// Global test utilities
export * from './helpers/db';
export * from './helpers/auth';
export * from './helpers/request';
