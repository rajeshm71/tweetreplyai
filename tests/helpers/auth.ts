import request from 'supertest';
import { Express } from 'express';
import { createMockUser } from '../factories/user.factory';

export function createAuthenticatedAgent(app: Express, user: any = null) {
  const agent = request.agent(app);
  const mockUser = user || createMockUser();
  
  // Override the agent's request method to inject authentication
  const originalRequest = agent.request;
  agent.request = function(method: string, url: string) {
    const req = originalRequest.call(this, method, url);
    
    // Override the request to inject authentication
    const originalEnd = req.end;
    req.end = function(callback: any) {
      // Inject authentication before the request
      this.req.user = mockUser;
      this.req.isAuthenticated = () => true;
      this.req.logout = (cb: any) => cb();
      
      return originalEnd.call(this, callback);
    };
    
    return req;
  };
  
  return agent;
}

export function createUnauthenticatedAgent(app: Express) {
  const agent = request.agent(app);
  
  // Override the agent's request method to inject unauthenticated state
  const originalRequest = agent.request;
  agent.request = function(method: string, url: string) {
    const req = originalRequest.call(this, method, url);
    
    // Override the request to inject unauthenticated state
    const originalEnd = req.end;
    req.end = function(callback: any) {
      // Inject unauthenticated state before the request
      this.req.user = null;
      this.req.isAuthenticated = () => false;
      this.req.logout = (cb: any) => cb();
      
      return originalEnd.call(this, callback);
    };
    
    return req;
  };
  
  return agent;
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
