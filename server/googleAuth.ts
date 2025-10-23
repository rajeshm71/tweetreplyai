import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { authService } from './services/authService.js';

export function setupGoogleAuth() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.warn('Google OAuth credentials not configured. Google login will be disabled.');
    return;
  }

  // const callbackURL = process.env.REPLIT_DOMAINS
  //   ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/api/auth/google/callback`
  //   : 'http://localhost:5000/api/auth/google/callback';

  const callbackURL = 'http://localhost:5000/api/auth/google/callback';
  
  console.log('Google OAuth callbackURL:', callbackURL);

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
        const user = await authService.findOrCreateUser({
          provider: 'google',
          providerId: profile.id,
          email,
          firstName: profile.name?.givenName,
          lastName: profile.name?.familyName,
          profileImageUrl: profile.photos?.[0]?.value,
        });

        console.log('User created/found:', user.id);
        return done(null, user);
      } catch (error) {
        console.error('Google OAuth error:', error);
        return done(error);
      }
    }
  ));
}
