import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { authService } from './services/authService.js';
import * as emailService from './services/emailService.js';

export function setupGoogleAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('Google OAuth credentials not configured. Google login will be disabled.');
    return;
  }

  const callbackURL = process.env.GOOGLE_CALLBACK_URL;
  
  console.log('=== GOOGLE OAUTH CONFIGURATION ===');
  console.log('GOOGLE_CLIENT_ID configured:', !!process.env.GOOGLE_CLIENT_ID);
  console.log('GOOGLE_CLIENT_SECRET configured:', !!process.env.GOOGLE_CLIENT_SECRET);
  console.log('GOOGLE_CALLBACK_URL:', callbackURL);
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('All environment variables with GOOGLE:', Object.keys(process.env).filter(key => key.includes('GOOGLE')));
  
  if (!callbackURL) {
    console.error('GOOGLE_CALLBACK_URL is not set! This will cause OAuth to fail.');
    return;
  }
  
  if (callbackURL.includes('localhost')) {
    console.error('WARNING: GOOGLE_CALLBACK_URL contains localhost! This will not work in production.');
  }

  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL,
      proxy: false, // Disable proxy detection that might force HTTPS
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        console.log('Google OAuth profile received:', {
          id: profile.id,
          email: profile.emails?.[0]?.value,
          name: profile.displayName
        });
        
        const email = profile.emails?.[0]?.value;
        const { user, isNewRegistration } = await authService.findOrCreateUser({
          provider: 'google',
          providerId: profile.id,
          email,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          profileImageUrl: profile.photos?.[0]?.value,
        });

        if (isNewRegistration) {
          emailService.sendWelcome(user.id).catch((error) => {
            console.error('[welcome-email] failed for userId:', user.id, 'error:', error);
          });
          emailService
            .syncContactToResend({
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
            })
            .catch(() => {});
        }

        console.log('User created/found:', user.id);
        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error);
      }
    }
  ));
}
