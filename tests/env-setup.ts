/**
 * Must be imported first from tests/setup.ts so process.env is populated
 * before any module (e.g. server/supabase.ts) is evaluated.
 */
import { config } from "dotenv";

config({ path: ".env.test" });

// Defaults for unit tests — real values come from .env.test when present.
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = "http://localhost:54321";
}
if (!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_ANON_KEY = "test-anon-key";
}

if (!process.env.DATABASE_URL) {
  process.env.SESSION_SECRET = "test-secret-key-for-testing-only";
  process.env.GOOGLE_CLIENT_ID = "test-google-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-client-secret";
  process.env.DODO_PAYMENTS_API_KEY = "dodo_test_key";
  process.env.DODO_PAYMENTS_ENVIRONMENT = "test_mode";
  process.env.DODO_WEBHOOK_SECRET = "dodo_test_webhook_secret";
  process.env.DODO_PRICE_WEEKLY = "dodo_price_weekly_test";
  process.env.DODO_PRICE_MONTHLY = "dodo_price_monthly_test";
  process.env.OPENAI_API_KEY = "test-openai-key-12345";
  process.env.GROQ_API_KEY = "test-groq-key-54321";
  process.env.NODE_ENV = "test";
  process.env.PORT = "5001";
  process.env.REPLIT_DOMAINS = "test-replit-domain";
}
