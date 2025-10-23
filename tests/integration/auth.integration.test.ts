import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupTestDatabase, cleanDatabase, closeTestDatabase, createTestUser } from '../helpers/db';
import { createMockUser } from '../factories/user.factory';

// Import the actual server setup
import { setupRoutes } from '../../server/routes';

describe('Authentication Integration Tests', () => {
  let app: express.Application;
  let testDb: any;

  // Helper function to skip tests if no database
  const skipIfNoDb = () => {
    if (!testDb) {
      console.log('Skipping test - no database connection');
      return true;
    }
    return false;
  };

  beforeAll(async () => {
    // Skip integration tests if no Supabase database is available
    if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('supabase.co')) {
      console.log('Skipping integration tests - no Supabase database configured');
      return;
    }

    try {
      // Setup test database
      testDb = await setupTestDatabase();
      
      // Create Express app with actual routes
      app = express();
      app.use(express.json());
      setupRoutes(app);
    } catch (error) {
      console.log('Skipping integration tests - database connection failed:', error.message);
      // Don't throw error, just skip the tests
      return;
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await closeTestDatabase();
  });

  describe('Full Authentication Flow', () => {
    it('should complete registration → login → logout flow', async () => {
      if (skipIfNoDb()) return;
      const userData = {
        email: 'integration-test@example.com',
        password: 'password123',
        firstName: 'Integration',
        lastName: 'Test',
      };

      // Step 1: Register user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(registerResponse.status).toBe(200);
      expect(registerResponse.body).toHaveProperty('user');
      expect(registerResponse.body.user.email).toBe(userData.email);

      // Step 2: Login user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('user');
      expect(loginResponse.body.user.email).toBe(userData.email);

      // Step 3: Get user data (should be authenticated)
      const userResponse = await request(app)
        .get('/api/auth/user')
        .set('Cookie', loginResponse.headers['set-cookie']);

      expect(userResponse.status).toBe(200);
      expect(userResponse.body.email).toBe(userData.email);

      // Step 4: Logout
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', loginResponse.headers['set-cookie']);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body.success).toBe(true);

      // Step 5: Verify user is logged out
      const userAfterLogoutResponse = await request(app)
        .get('/api/auth/user')
        .set('Cookie', loginResponse.headers['set-cookie']);

      expect(userAfterLogoutResponse.status).toBe(401);
    });

    it('should handle session persistence across requests', async () => {
      if (skipIfNoDb()) return;
      const userData = {
        email: 'session-test@example.com',
        password: 'password123',
        firstName: 'Session',
        lastName: 'Test',
      };

      // Register and login
      await request(app)
        .post('/api/auth/register')
        .send(userData);

      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      const sessionCookie = loginResponse.headers['set-cookie'];

      // Make multiple requests with the same session
      for (let i = 0; i < 3; i++) {
        const userResponse = await request(app)
          .get('/api/auth/user')
          .set('Cookie', sessionCookie);

        expect(userResponse.status).toBe(200);
        expect(userResponse.body.email).toBe(userData.email);
      }
    });

    it('should handle password hashing and verification', async () => {
      if (skipIfNoDb()) return;
      const userData = {
        email: 'password-test@example.com',
        password: 'password123',
        firstName: 'Password',
        lastName: 'Test',
      };

      // Register user
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(registerResponse.status).toBe(200);

      // Try to login with wrong password
      const wrongPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: 'wrongpassword',
        });

      expect(wrongPasswordResponse.status).toBe(401);

      // Login with correct password
      const correctPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: userData.email,
          password: userData.password,
        });

      expect(correctPasswordResponse.status).toBe(200);
    });

    it('should handle concurrent user sessions', async () => {
      if (skipIfNoDb()) return;
      const user1Data = {
        email: 'concurrent1@example.com',
        password: 'password123',
        firstName: 'User',
        lastName: 'One',
      };

      const user2Data = {
        email: 'concurrent2@example.com',
        password: 'password123',
        firstName: 'User',
        lastName: 'Two',
      };

      // Register both users
      await request(app)
        .post('/api/auth/register')
        .send(user1Data);

      await request(app)
        .post('/api/auth/register')
        .send(user2Data);

      // Login both users
      const user1Login = await request(app)
        .post('/api/auth/login')
        .send({
          email: user1Data.email,
          password: user1Data.password,
        });

      const user2Login = await request(app)
        .post('/api/auth/login')
        .send({
          email: user2Data.email,
          password: user2Data.password,
        });

      // Verify both sessions work independently
      const user1Response = await request(app)
        .get('/api/auth/user')
        .set('Cookie', user1Login.headers['set-cookie']);

      const user2Response = await request(app)
        .get('/api/auth/user')
        .set('Cookie', user2Login.headers['set-cookie']);

      expect(user1Response.status).toBe(200);
      expect(user1Response.body.email).toBe(user1Data.email);

      expect(user2Response.status).toBe(200);
      expect(user2Response.body.email).toBe(user2Data.email);

      // Verify sessions don't interfere with each other
      expect(user1Response.body.email).not.toBe(user2Response.body.email);
    });

    it('should handle user not found scenarios', async () => {
      if (skipIfNoDb()) return;
      // Try to login with non-existent user
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(loginResponse.status).toBe(401);

      // Try to get user data without authentication
      const userResponse = await request(app)
        .get('/api/auth/user');

      expect(userResponse.status).toBe(401);
    });

    it('should handle duplicate email registration', async () => {
      if (skipIfNoDb()) return;
      const userData = {
        email: 'duplicate@example.com',
        password: 'password123',
        firstName: 'Duplicate',
        lastName: 'Test',
      };

      // Register user first time
      const firstRegister = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(firstRegister.status).toBe(200);

      // Try to register with same email
      const secondRegister = await request(app)
        .post('/api/auth/register')
        .send(userData);

      expect(secondRegister.status).toBe(400);
      expect(secondRegister.body.message).toContain('already exists');
    });

    it('should validate input fields properly', async () => {
      if (skipIfNoDb()) return;
      // Test missing fields
      const missingFieldsResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          // Missing password, firstName, lastName
        });

      expect(missingFieldsResponse.status).toBe(400);

      // Test invalid email
      const invalidEmailResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          firstName: 'Test',
          lastName: 'User',
        });

      expect(invalidEmailResponse.status).toBe(400);

      // Test weak password
      const weakPasswordResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '123', // Too short
          firstName: 'Test',
          lastName: 'User',
        });

      expect(weakPasswordResponse.status).toBe(400);
    });
  });
});
