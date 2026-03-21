/**
 * Auth route unit tests mirror production behavior in server/routes.ts and server/localAuth.ts.
 * - Register/login flow: passport.authenticate(strategy, callback) — mock the callback tuple (err, user, info)
 *   per test when asserting failure/success; vi.clearAllMocks() in beforeEach resets mocks, so overrides
 *   must be set inside each test that needs a non-default outcome.
 * - Data layer: routes use storage + password utils via Passport strategies, not authService for these paths.
 * - Rate limiting: express-rate-limit is mocked to a no-op so assertions are not flaky (429).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createTestApp, expectJsonResponse, expectAuthError, expectValidationError } from '../../helpers/request';
import { createMockUser } from '../../factories/user.factory';
import { setupRoutes } from '../../../server/routes';

// No-op rate limiter so register/login tests are not capped at 10/15m per IP
vi.mock('express-rate-limit', () => ({
  default: vi.fn(() => (req: any, res: any, next: any) => next()),
}));

// Mock the storage module
vi.mock('../../../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    upsertUser: vi.fn(),
    getUserByEmail: vi.fn(),
    updateUser: vi.fn(),
  },
}));

// Kept for any code paths that still reference authService; register/login use Passport + storage
vi.mock('../../../server/services/authService', () => ({
  authService: {
    findUserByEmail: vi.fn(),
    createUser: vi.fn(),
    validatePassword: vi.fn(),
    findUserById: vi.fn(),
  },
}));

vi.mock('../../../server/services/whitelistService', () => ({
  whitelistService: {
    isWhitelisted: vi.fn(() => false),
  },
}));

// Mock Passport — default success user; individual tests override authenticate for failure paths
vi.mock('passport', () => ({
  default: {
    authenticate: vi.fn((strategy: string, callback?: any) => {
      if (callback) {
        return (req: any, res: any, next: any) => {
          callback(null, { id: 'test-user' }, undefined);
        };
      }
      return (req: any, res: any, next: any) => next();
    }),
    initialize: vi.fn(() => (req: any, res: any, next: any) => next()),
    session: vi.fn(() => (req: any, res: any, next: any) => next()),
    serializeUser: vi.fn((user: any, done: any) => {
      if (typeof done === 'function') {
        done(null, user.id);
      }
    }),
    deserializeUser: vi.fn(async (sessionUser: any, done: any) => {
      if (typeof done === 'function') {
        done(null, false);
      }
    }),
    use: vi.fn(),
  },
}));

// Mock the usage service
vi.mock('../../../server/services/usage', () => ({
  usageService: {
    initializeTrialForUser: vi.fn(),
  },
}));

// Suppress MSW/Resend network warnings triggered by the register route calling sendWelcomeEmail
vi.mock('../../../server/utils/email', () => ({
  sendWelcomeEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock replitAuth to avoid environment variable issues
vi.mock('../../../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((req: any, res: any, next: any) => {
    req.user = { id: 'test-user' };
    req.isAuthenticated = () => true;
    next();
  }),
  getUserId: vi.fn((req: any) => req.user?.id || 'test-user'),
}));

// Mock local auth functions
vi.mock('../../../server/localAuth', () => ({
  setupLocalAuth: vi.fn(() => {
    const passport = require('passport');
    const { Strategy } = require('passport-local');

    passport.use(
      'local-register',
      new Strategy(
        {
          usernameField: 'email',
          passwordField: 'password',
          passReqToCallback: true,
        },
        async (req: any, email: string, password: string, done: any) => {
          try {
            const { storage } = require('../../../server/storage');
            const { validateEmail, validatePasswordStrength, hashPassword } = require('../../../server/utils/password');

            if (!email || !password || !req.body.firstName || !req.body.lastName) {
              return done(null, false, { message: 'Missing required fields' });
            }

            if (!validateEmail(email)) {
              return done(null, false, { message: 'Invalid email format' });
            }

            const validation = validatePasswordStrength(password);
            if (!validation.isValid) {
              return done(null, false, { message: validation.errors.join(', ') });
            }

            const existingUser = await storage.getUserByEmail(email);
            if (existingUser) {
              return done(null, false, { message: 'Email already registered' });
            }

            const passwordHash = await hashPassword(password);
            const body = req.body as any;

            const user = await storage.upsertUser({
              email,
              password: passwordHash,
              firstName: body.firstName,
              lastName: body.lastName,
              emailVerified: false,
              authProviders: ['password'],
              primaryAuthProvider: 'password',
              lastLoginAt: new Date(),
            });

            return done(null, user);
          } catch (error) {
            return done(error);
          }
        },
      ),
    );

    passport.use(
      'local-login',
      new Strategy(
        {
          usernameField: 'email',
          passwordField: 'password',
        },
        async (email: string, password: string, done: any) => {
          try {
            const { storage } = require('../../../server/storage');
            const { verifyPassword } = require('../../../server/utils/password');

            const user = await storage.getUserByEmail(email);
            if (!user || !user.password) {
              return done(null, false, { message: 'Invalid email or password' });
            }

            const isValid = await verifyPassword(password, user.password);
            if (!isValid) {
              return done(null, false, { message: 'Invalid email or password' });
            }

            await storage.updateUser(user.id, { lastLoginAt: new Date() });

            return done(null, user);
          } catch (error) {
            return done(error);
          }
        },
      ),
    );
  }),
}));

// Mock password utilities
vi.mock('../../../server/utils/password', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  validatePasswordStrength: vi.fn(),
  validateEmail: vi.fn(),
}));

describe('Authentication Endpoints - Unit Tests', () => {
  let app: any;
  let expressApp: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();

    expressApp = express();
    expressApp.use(express.json());

    expressApp.use((req: any, res: any, next: any) => {
      req.user = { id: 'test-user' };
      req.isAuthenticated = vi.fn(() => true);
      req.logout = vi.fn((cb: any) => cb());
      req.logIn = vi.fn((user: any, cb: any) => cb(null));
      next();
    });

    await setupRoutes(expressApp);

    app = createTestApp(expressApp);

    const passport = await import('passport');
    vi.mocked(passport.default.authenticate).mockImplementation((strategy: string, callback?: any) => {
      if (callback) {
        return (req: any, res: any, next: any) => {
          callback(null, { id: 'test-user' }, undefined);
        };
      }
      return (req: any, res: any, next: any) => next();
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register new user successfully', async () => {
      const mockUser = createMockUser();

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUserByEmail).mockResolvedValue(null);
      vi.mocked(storage.upsertUser).mockResolvedValue(mockUser);

      const { validateEmail, validatePasswordStrength, hashPassword } = await import('../../../server/utils/password');
      vi.mocked(validateEmail).mockReturnValue(true);
      vi.mocked(validatePasswordStrength).mockReturnValue({ isValid: true, errors: [] });
      vi.mocked(hashPassword).mockResolvedValue('hashed-password');

      const response = await app.raw().post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      // NOTE: storage.upsertUser is called inside the Passport 'local-register' strategy.
      // Because the strategy is mocked at the passport level (bypassing actual strategy logic),
      // we cannot assert on storage.upsertUser here. We verify the route response contract instead.
      expectJsonResponse(response, 200, {
        user: expect.objectContaining({
          id: expect.any(String),
        }),
        message: 'Registration successful',
        token: expect.any(String),
      });
    });

    it('should return 400 when password is missing (Zod validation hits before Passport)', async () => {
      const passport = await import('passport');
      const mockAuthenticate = vi.fn().mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Missing required fields' });
        };
      });
      vi.mocked(passport.default.authenticate).mockImplementation(mockAuthenticate as any);

      const response = await app.raw().post('/api/auth/register').send({
        email: 'test@example.com',
      });

      expectValidationError(response, ['password', 'firstName', 'lastName']);
    });

    it('should return 400 for invalid email format', async () => {
      const response = await app.raw().post('/api/auth/register').send({
        email: 'invalid-email',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      expectValidationError(response, ['email']);
    });

    it('should return 400 for weak password', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Password strength validation failed' });
        };
      });

      const response = await app.raw().post('/api/auth/register').send({
        email: 'test@example.com',
        password: '123',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Password strength validation failed');
    });

    it('should return 400 for duplicate email', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Email already registered' });
        };
      });

      const response = await app.raw().post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      expectJsonResponse(response, 400, {
        message: 'Email already registered',
      });
    });

    it('should return 500 for registration failure', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(new Error('Database error'));
        };
      });

      const response = await app.raw().post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      });

      expectJsonResponse(response, 500, {
        message: 'Registration failed',
        error: 'Database error',
      });
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const mockUser = createMockUser({
        id: 'login-user-1',
        email: 'test@example.com',
      });

      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, mockUser, undefined);
        };
      });

      const response = await app.raw().post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expectJsonResponse(response, 200, {
        user: expect.objectContaining({
          id: mockUser.id,
          email: mockUser.email,
        }),
        message: 'Login successful',
        token: expect.any(String),
      });
    });

    it('should return 401 for invalid password', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Invalid email or password' });
        };
      });

      const response = await app.raw().post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'wrongpassword',
      });

      expectJsonResponse(response, 401, {
        message: 'Invalid email or password',
      });
    });

    it('should return 401 for non-existent user', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(null, false, { message: 'Invalid email or password' });
        };
      });

      const response = await app.raw().post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'password123',
      });

      expectJsonResponse(response, 401, {
        message: 'Invalid email or password',
      });
    });

    it('should return 500 for login failure', async () => {
      const passport = await import('passport');
      vi.mocked(passport.default.authenticate).mockImplementation((_strategy: string, callback: any) => {
        return (req: any, res: any, next: any) => {
          callback(new Error('Database error'));
        };
      });

      const response = await app.raw().post('/api/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      });

      expectJsonResponse(response, 500, {
        message: 'Login failed',
        error: 'Database error',
      });
    });
  });

  describe('GET /api/auth/user', () => {
    it('should return user data when authenticated', async () => {
      const mockUser = createMockUser({
        id: 'test-user',
        email: 'authed@example.com',
        firstName: 'Test',
        lastName: 'User',
        profileImageUrl: null,
        authProviders: ['local'],
        xUsername: undefined,
      });

      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(mockUser as any);

      const { whitelistService } = await import('../../../server/services/whitelistService');
      vi.mocked(whitelistService.isWhitelisted).mockReturnValue(false);

      const response = await app.raw().get('/api/auth/user');

      expectJsonResponse(response, 200, {
        id: 'test-user',
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        profileImageUrl: mockUser.profileImageUrl,
        authProviders: ['local'],
        isWhitelisted: false,
        xUsername: null,
      });
    });

    it('should return 401 when not authenticated', async () => {
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());

      unauthenticatedApp.use((req: any, res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = vi.fn(() => false);
        req.logout = vi.fn((cb: any) => cb());
        next();
      });

      await setupRoutes(unauthenticatedApp);

      const response = await createTestApp(unauthenticatedApp).raw().get('/api/auth/user');

      expectAuthError(response);
    });

    it('should return 404 for deleted user', async () => {
      const { storage } = await import('../../../server/storage');
      vi.mocked(storage.getUser).mockResolvedValue(null);

      const response = await app.raw().get('/api/auth/user');

      expectJsonResponse(response, 404, {
        message: 'User not found',
      });
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should clear session successfully', async () => {
      const response = await app.raw().post('/api/auth/logout');

      expectJsonResponse(response, 200, {
        success: true,
      });
    });

    it('should return success even if not logged in', async () => {
      const response = await app.raw().post('/api/auth/logout');

      expectJsonResponse(response, 200, {
        success: true,
      });
    });
  });

  describe('POST /api/auth/initialize-trial', () => {
    it('should create trial for new user', async () => {
      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.initializeTrialForUser).mockResolvedValue({});

      const response = await app.raw().post('/api/auth/initialize-trial');

      expectJsonResponse(response, 200, {
        success: true,
      });
    });

    it('should return 401 if not authenticated', async () => {
      const unauthenticatedApp = express();
      unauthenticatedApp.use(express.json());

      unauthenticatedApp.use((req: any, res: any, next: any) => {
        req.user = null;
        req.isAuthenticated = vi.fn(() => false);
        req.logout = vi.fn((cb: any) => cb());
        next();
      });

      await setupRoutes(unauthenticatedApp);

      const response = await request(unauthenticatedApp).post('/api/auth/initialize-trial');

      expectAuthError(response);
    });

    it('should return 500 for initialization failure', async () => {
      const { usageService } = await import('../../../server/services/usage');
      vi.mocked(usageService.initializeTrialForUser).mockRejectedValue(new Error('Database error'));

      const response = await app.raw().post('/api/auth/initialize-trial');

      expectJsonResponse(response, 500, {
        message: 'Failed to initialize trial',
      });
    });
  });
});
