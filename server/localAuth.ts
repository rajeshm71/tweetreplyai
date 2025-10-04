import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import { storage } from './storage';
import { hashPassword, verifyPassword, validatePasswordStrength, validateEmail } from './utils/password';
import type { User } from '@shared/schema';

export function setupLocalAuth() {
  passport.use('local-login', new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
    },
    async (email, password, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        
        if (!user || !user.passwordHash) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        await storage.updateUser(user.id, { lastLoginAt: new Date() });
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  passport.use('local-register', new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password',
      passReqToCallback: true,
    },
    async (req, email, password, done) => {
      try {
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
          passwordHash,
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
    }
  ));
}

export interface LocalAuthUser extends User {
  id: string;
}

export function serializeLocalUser(user: LocalAuthUser, done: (err: any, id?: string) => void) {
  done(null, user.id);
}

export async function deserializeLocalUser(id: string, done: (err: any, user?: User | false) => void) {
  try {
    const user = await storage.getUser(id);
    done(null, user || false);
  } catch (error) {
    done(error, false);
  }
}
