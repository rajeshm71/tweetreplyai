import { describe, it, expect, vi } from 'vitest';
import express from 'express';

vi.mock('../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
  getUserId: vi.fn(() => 'test-user'),
}));
vi.mock('../server/localAuth', () => ({ setupLocalAuth: vi.fn() }));
vi.mock('../server/googleAuth', () => ({ setupGoogleAuth: vi.fn() }));
vi.mock('../server/storage', () => ({ storage: { getUser: vi.fn() } }));

import { setupRoutes } from '../server/routes';

describe('App Bootstrap - Unit Tests', () => {
  it('registers routes without throwing', async () => {
    const app = express();
    app.use(express.json());
    await expect(setupRoutes(app)).resolves.toBeDefined();
  });

  it('creates an Express app with a router after setupRoutes', async () => {
    const app = express();
    app.use(express.json());
    await setupRoutes(app);
    expect(app._router).toBeDefined();
  });
});
