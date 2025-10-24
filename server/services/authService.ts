import { storage } from '../storage.js';
import type { User } from '../../shared/types.js';

export interface AuthProfile {
  provider: 'google' | 'password' | 'replit';
  providerId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  handle?: string;
}

export class AuthService {
  async findOrCreateUser(profile: AuthProfile): Promise<User> {
    let user: User | undefined;

    switch (profile.provider) {
      case 'google':
        user = await storage.getUserByGoogleSub(profile.providerId);
        break;
      case 'replit':
        user = await storage.getUserByReplitSub(profile.providerId);
        break;
    }

    if (user) {
      await this.ensureProviderLinked(user.id, profile.provider);
      await storage.updateUser(user.id, { lastLoginAt: new Date() });
      return user;
    }

    if (profile.email) {
      const existingUserByEmail = await storage.getUserByEmail(profile.email);
      if (existingUserByEmail) {
        return await this.linkAccountToUser(existingUserByEmail.id, profile);
      }
    }

    return await this.createNewUser(profile);
  }

  private async createNewUser(profile: AuthProfile): Promise<User> {
    const userData: UpsertUser = {
      id: crypto.randomUUID(),
      email: profile.email,
      authProviders: [profile.provider],
    };

    switch (profile.provider) {
      case 'google':
        userData.googleSub = profile.providerId;
        break;
      case 'replit':
        userData.replitSub = profile.providerId;
        userData.id = profile.providerId;
        break;
    }

    return await storage.upsertUser(userData);
  }

  private async linkAccountToUser(userId: string, profile: AuthProfile): Promise<User> {
    const updates: any = {
      lastLoginAt: new Date(),
    };

    switch (profile.provider) {
      case 'google':
        updates.googleSub = profile.providerId;
        break;
      case 'replit':
        updates.replitSub = profile.providerId;
        break;
    }

    if (profile.firstName && !updates.firstName) {
      updates.firstName = profile.firstName;
    }
    if (profile.lastName && !updates.lastName) {
      updates.lastName = profile.lastName;
    }
    if (profile.profileImageUrl && !updates.profileImageUrl) {
      updates.profileImageUrl = profile.profileImageUrl;
    }

    await storage.addAuthProvider(userId, profile.provider);
    return await storage.updateUser(userId, updates);
  }

  private async ensureProviderLinked(userId: string, provider: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (user && (!user.authProviders || !user.authProviders.includes(provider))) {
      await storage.addAuthProvider(userId, provider);
    }
  }

  async unlinkProvider(userId: string, provider: string): Promise<void> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const providers = user.authProviders || [];
    if (providers.length <= 1) {
      throw new Error('Cannot unlink the last authentication method');
    }

    if (!providers.includes(provider)) {
      throw new Error('Provider not linked to this account');
    }

    await storage.removeAuthProvider(userId, provider);

    const updates: any = {};
    switch (provider) {
      case 'google':
        updates.googleSub = null;
        break;
      case 'replit':
        updates.replitSub = null;
        break;
      case 'password':
        updates.passwordHash = null;
        break;
    }

    await storage.updateUser(userId, updates);
  }
}

export const authService = new AuthService();
