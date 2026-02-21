# Testing Guide

This directory contains comprehensive tests for the TweetReply AI backend API.

## Test Structure

```
tests/
├── setup.ts                          # Global test setup
├── README.md                         # This file
├── helpers/
│   ├── db.ts                        # Database test utilities
│   ├── auth.ts                      # Authentication helpers
│   └── request.ts                   # HTTP request helpers
├── factories/
│   ├── user.factory.ts             # User test data
│   ├── usage.factory.ts            # Usage test data
│   └── subscription.factory.ts     # Subscription test data
├── mocks/
│   ├── handlers.ts                 # MSW handlers
│   ├── stripe.mock.ts              # Stripe mocks
│   └── openai.mock.ts              # OpenAI mocks
├── unit/
│   ├── routes/
│   │   ├── auth.test.ts           # Auth endpoints
│   │   ├── ai.test.ts             # AI endpoints
│   │   ├── usage.test.ts          # Usage endpoints
│   │   ├── billing.test.ts        # Billing endpoints
│   │   └── feedback.test.ts       # Feedback endpoints
│   └── services/
│       ├── ai-router.test.ts      # AI router service
│       ├── usage.test.ts          # Usage service
│       └── stripe.test.ts         # Stripe service
└── integration/
    ├── setup.ts                    # Integration test setup
    ├── auth.integration.test.ts    # Auth flow tests
    ├── ai-generation.integration.test.ts
    ├── subscription.integration.test.ts
    └── data-integrity.integration.test.ts
```

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (for development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Visual Test UI
```bash
npm run test:ui
```

## Test Types

### Unit Tests
- **Location**: `tests/unit/`
- **Purpose**: Test individual functions and endpoints in isolation
- **Mocks**: All external dependencies (database, APIs) are mocked
- **Speed**: Fast execution (< 30 seconds)
- **Coverage**: 80%+ threshold required

### Integration Tests
- **Location**: `tests/integration/`
- **Purpose**: Test complete workflows with real database
- **Database**: Uses Supabase database (requires DATABASE_URL)
- **Speed**: Slower execution (< 2 minutes)
- **Coverage**: Critical user flows

## Test Configuration

### Environment Variables
Tests use a separate test environment. Set these in your `.env.test` file:

```env
DATABASE_URL=postgresql://[supabase-db-url]
SESSION_SECRET=test-secret-key
GOOGLE_CLIENT_ID=test-google-client-id
GOOGLE_CLIENT_SECRET=test-google-client-secret
STRIPE_SECRET_KEY=sk_test_xxx
OPENAI_API_KEY=test-openai-key
GROQ_API_KEY=test-groq-key
NODE_ENV=test
```

### Database Setup
Integration tests require a Supabase database:
1. Create a project in Supabase
2. Run migrations: `npm run db:push`
3. Set `DATABASE_URL` to point to your Supabase database
4. If no `DATABASE_URL` is set, integration tests will be skipped

## Writing Tests

### Test Structure
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestApp, expectJsonResponse } from '../helpers/request';

describe('Feature Name - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Endpoint Name', () => {
    it('should do something specific', async () => {
      // Arrange
      const app = createTestApp(mockApp);
      
      // Act
      const response = await app.authenticated(user)
        .post('/api/endpoint')
        .send(data);
      
      // Assert
      expectJsonResponse(response, 200, expectedData);
    });
  });
});
```

### Test Helpers

#### Database Helpers
```typescript
import { setupTestDatabase, cleanDatabase, createTestUser } from '../helpers/db';

// Setup test database
const testDb = await setupTestDatabase();

// Clean database before/after tests
await cleanDatabase();

// Create test data
const user = await createTestUser({ email: 'test@example.com' });
```

#### Authentication Helpers
```typescript
import { createAuthenticatedAgent, createUnauthenticatedAgent } from '../helpers/auth';

// Create authenticated request
const agent = createAuthenticatedAgent(app, user);

// Create unauthenticated request
const agent = createUnauthenticatedAgent(app);
```

#### Request Helpers
```typescript
import { expectJsonResponse, expectAuthError, expectValidationError } from '../helpers/request';

// Test successful JSON response
expectJsonResponse(response, 200, expectedData);

// Test authentication error
expectAuthError(response);

// Test validation error
expectValidationError(response);
```

### Test Factories
```typescript
import { createMockUser } from '../factories/user.factory';
import { createMockUsageCounter } from '../factories/usage.factory';

// Create test data with defaults
const user = createMockUser();
const usage = createMockUsageCounter({ limit: 50 });
```

### Mocking External Services
```typescript
// Mock Stripe
vi.mock('../../../server/services/stripe', () => ({
  stripeService: {
    createCheckoutSession: vi.fn(),
  },
}));

// Mock database
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
  },
}));
```

## Test Guidelines

### Naming Conventions
- Test files: `*.test.ts` for unit tests, `*.integration.test.ts` for integration tests
- Test descriptions: Use "should" statements
- Group related tests with `describe` blocks

### Test Organization
- One test file per route group or service
- Group tests by functionality
- Use `beforeEach` to reset mocks
- Use `beforeAll`/`afterAll` for setup/cleanup

### Assertions
- Use specific assertion helpers (`expectJsonResponse`, `expectAuthError`)
- Test both success and error cases
- Verify response status, headers, and body
- Test edge cases and boundary conditions

### Mocking Strategy
- Mock external APIs (Stripe, OpenAI, Groq)
- Mock database operations for unit tests
- Use real database for integration tests
- Reset mocks between tests

### Coverage Requirements
- **Lines**: 80%+
- **Functions**: 80%+
- **Branches**: 80%+
- **Statements**: 80%+

## CI/CD Integration

Tests run automatically on:
- Pull requests
- Pushes to main branch
- Manual triggers

### GitHub Actions
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:coverage
```

## Debugging Tests

### Running Specific Tests
```bash
# Run specific test file
npm test auth.test.ts

# Run tests matching pattern
npm test -- --grep "should login"

# Run tests in specific directory
npm test unit/routes/
```

### Debug Mode
```bash
# Run with debug output
DEBUG=* npm test

# Run single test with debug
npm test -- --reporter=verbose auth.test.ts
```

### Test Database
- Integration tests use Supabase database
- Database is cleaned before/after each test
- Use `createTestUser()` for consistent test data
- Tests are skipped if no Supabase DATABASE_URL is configured

## Common Issues

### Test Failures
1. **Mock not working**: Check if mock is properly set up in `beforeEach`
2. **Database errors**: Ensure test database is properly configured
3. **Timeout errors**: Increase `testTimeout` in `vitest.config.ts`
4. **Coverage issues**: Add tests for missing branches

### Performance
- Unit tests should run in < 30 seconds
- Integration tests should run in < 2 minutes
- Use `vi.hoisted()` for expensive setup
- Clean up resources in `afterEach`

### Flaky Tests
- Avoid relying on external services
- Use deterministic test data
- Mock time-dependent operations
- Ensure proper cleanup between tests

## Contributing

When adding new features:
1. Write unit tests first (TDD approach)
2. Add integration tests for critical flows
3. Ensure coverage thresholds are met
4. Update this documentation if needed

When fixing bugs:
1. Write a test that reproduces the bug
2. Fix the bug
3. Ensure the test passes
4. Run full test suite
