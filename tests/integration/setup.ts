import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { setupTestDatabase, cleanDatabase, closeTestDatabase } from '../helpers/db';

let testDb: any;

beforeAll(async () => {
  // Setup test database connection
  testDb = await setupTestDatabase();
  console.log('Integration test database connected');
});

beforeEach(async () => {
  // Clean database before each test
  await cleanDatabase();
  console.log('Database cleaned before test');
});

afterEach(async () => {
  // Clean database after each test
  await cleanDatabase();
  console.log('Database cleaned after test');
});

afterAll(async () => {
  // Close database connection
  await closeTestDatabase();
  console.log('Integration test database disconnected');
});

export { testDb };
