import request from 'supertest';
import { Express } from 'express';
import { createAuthenticatedAgent, createUnauthenticatedAgent } from './auth';

export function createTestApp(app: Express | any) {
  if (!app || !app._router) {
    throw new Error('createTestApp expects a real Express app with routes');
  }

  return {
    authenticated: (user?: any) => createAuthenticatedAgent(app, user),
    unauthenticated: () => createUnauthenticatedAgent(app),
    raw: () => request(app),
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
