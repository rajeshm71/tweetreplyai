import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../shared/schema';
import { eq } from 'drizzle-orm';

let testDb: ReturnType<typeof drizzle>;
let testClient: ReturnType<typeof postgres>;

export async function setupTestDatabase() {
  if (!process.env.DATABASE_URL) {
    console.log('Skipping database setup - no Supabase DATABASE_URL configured');
    return null;
  }

  // Only proceed if we have a real Supabase DATABASE_URL
  if (!process.env.DATABASE_URL.includes('supabase.co')) {
    console.log('Skipping database setup - DATABASE_URL does not appear to be Supabase');
    return null;
  }

  // Create a separate test database connection
  testClient = postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  testDb = drizzle(testClient, { schema });
  return testDb;
}

export async function cleanDatabase() {
  if (!testDb) {
    // If no database connection, skip cleaning
    return;
  }

  // Clean all tables in reverse dependency order
  await testDb.delete(schema.feedback);
  await testDb.delete(schema.replyEvents);
  await testDb.delete(schema.usageCounters);
  await testDb.delete(schema.subscriptions);
  await testDb.delete(schema.sessions);
  await testDb.delete(schema.users);
}

export async function seedTestData() {
  if (!testDb) {
    await setupTestDatabase();
  }

  // Create test users
  const testUsers = [
    {
      id: 'test-user-1',
      email: 'test1@example.com',
      firstName: 'Test',
      lastName: 'User1',
      authProviders: ['local'],
      emailVerified: true,
      passwordHash: '$2b$10$test.hash.1',
    },
    {
      id: 'test-user-2',
      email: 'test2@example.com',
      firstName: 'Test',
      lastName: 'User2',
      authProviders: ['google'],
      emailVerified: true,
      googleSub: 'google-123',
    },
  ];

  for (const user of testUsers) {
    await testDb.insert(schema.users).values(user).onConflictDoNothing();
  }

  // Create test usage counter
  await testDb.insert(schema.usageCounters).values({
    userId: 'test-user-1',
    planCode: 'trial',
    periodStart: new Date('2024-01-01'),
    periodEnd: new Date('2024-01-31'),
    repliesUsed: 5,
    limit: 10,
    resetAt: new Date('2024-01-31'),
  }).onConflictDoNothing();

  return testUsers;
}

export async function createTestUser(overrides: Partial<typeof schema.users.$inferInsert> = {}) {
  if (!testDb) {
    await setupTestDatabase();
  }

  const user = {
    id: `test-user-${Date.now()}`,
    email: `test-${Date.now()}@example.com`,
    firstName: 'Test',
    lastName: 'User',
    authProviders: ['local'],
    emailVerified: true,
    passwordHash: '$2b$10$test.hash',
    ...overrides,
  };

  await testDb.insert(schema.users).values(user);
  return user;
}

export async function createTestSubscription(overrides: Partial<typeof schema.subscriptions.$inferInsert> = {}) {
  if (!testDb) {
    await setupTestDatabase();
  }

  const subscription = {
    userId: 'test-user-1',
    planCode: 'monthly',
    status: 'active',
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    stripeSubscriptionId: `sub_test_${Date.now()}`,
    amountPaid: 999,
    currency: 'usd',
    ...overrides,
  };

  await testDb.insert(schema.subscriptions).values(subscription);
  return subscription;
}

export async function createTestUsageCounter(overrides: Partial<typeof schema.usageCounters.$inferInsert> = {}) {
  if (!testDb) {
    await setupTestDatabase();
  }

  const usageCounter = {
    userId: 'test-user-1',
    planCode: 'trial',
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    repliesUsed: 0,
    limit: 10,
    resetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    ...overrides,
  };

  await testDb.insert(schema.usageCounters).values(usageCounter);
  return usageCounter;
}

export async function closeTestDatabase() {
  if (testClient) {
    await testClient.end();
  }
  // Reset the variables
  testDb = null;
  testClient = null;
}

export { testDb };
