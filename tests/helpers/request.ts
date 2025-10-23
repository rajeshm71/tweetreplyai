import request from 'supertest';
import { Express } from 'express';
import { createAuthenticatedAgent, createUnauthenticatedAgent } from './auth';

export function createTestApp(app: Express | any) {
  // Check if it's a real Express app (has _router property)
  if (app && app._router) {
    // Use the real Express app with actual routes
    return {
      authenticated: (user?: any) => createAuthenticatedAgent(app, user),
      unauthenticated: () => createUnauthenticatedAgent(app),
      raw: () => request(app),
    };
  }
  
  // If it's a mock app, create a simple Express app for testing
  const express = require('express');
  const mockExpressApp = express();
  mockExpressApp.use(express.json());
  
  // Add basic routes for testing
  mockExpressApp.get('/api/usage', (req: any, res: any) => {
    res.json({ used: 5, limit: 10, resetAt: new Date() });
  });
  
  mockExpressApp.post('/api/generate-reply', (req: any, res: any) => {
    res.json({ reply: 'Test reply', used: 1, limit: 10 });
  });
  
  return {
    authenticated: (user?: any) => createAuthenticatedAgent(mockExpressApp, user),
    unauthenticated: () => createUnauthenticatedAgent(mockExpressApp),
    raw: () => request(mockExpressApp),
  };
}

export function expectJsonResponse(res: any, expectedStatus: number, expectedData?: any) {
  expect(res.status).toBe(expectedStatus);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  
  if (expectedData) {
    expect(res.body).toMatchObject(expectedData);
  }
}

export function expectErrorResponse(res: any, expectedStatus: number, expectedMessage?: string) {
  expect(res.status).toBe(expectedStatus);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toHaveProperty('message');
  
  if (expectedMessage) {
    expect(res.body.message).toBe(expectedMessage);
  }
}

export function expectValidationError(res: any, expectedFields: string[] = []) {
  expect(res.status).toBe(400);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toHaveProperty('message');
  
  if (expectedFields.length > 0) {
    expect(res.body.message.toLowerCase()).toContain('validation');
  }
}

export function expectAuthError(res: any) {
  expect(res.status).toBe(401);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body.message).toBe('Unauthorized');
}

export function expectNotFoundError(res: any) {
  expect(res.status).toBe(404);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body.message).toBe('User not found');
}

export function expectQuotaExceededError(res: any) {
  expect(res.status).toBe(402);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toHaveProperty('error');
  expect(res.body.error).toBe('quota_exceeded');
}
