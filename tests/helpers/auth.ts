import request from 'supertest';
import { Express } from 'express';
import { createMockUser } from '../factories/user.factory';

export function createAuthenticatedAgent(app: Express, user: any = null) {
  // Auth behavior should be configured in the Express app middleware for each test.
  // Keep the helper minimal and deterministic.
  void (user || createMockUser());
  return request.agent(app);
}

export function createUnauthenticatedAgent(app: Express) {
  return request.agent(app);
}

export function mockPassportSession(user: any = null) {
  return {
    user: user || createMockUser(),
    isAuthenticated: () => true,
    login: (user: any, callback: (err?: any) => void) => {
      // Mock successful login
      callback();
    },
    logout: (callback: (err?: any) => void) => {
      // Mock successful logout
      callback();
    },
  };
}

export function createAuthHeaders(token: string = 'test-token') {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function createSessionCookie(sessionId: string = 'test-session-id') {
  return {
    'Cookie': `connect.sid=${sessionId}`,
  };
}
