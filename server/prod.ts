import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic, log } from "./static.js";
import { getClientErrorBody } from "./config/env.js";
import cors from "cors";
import { corsApiOptions } from "./config/cors.js";
import { redactForLogs, safeStringifyForLogs } from "./utils/logging.js";

const app = express();

// Trust first proxy (e.g. Vercel) so X-Forwarded-For is used and express-rate-limit can identify clients
app.set('trust proxy', 1);

// Apply raw body parser for webhook route BEFORE json parser
// This is critical for webhook signature verification
app.use('/api/dodo/webhook', express.raw({ type: 'application/json' }));

// Apply JSON parser for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/api', cors(corsApiOptions));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        try {
          const redacted = redactForLogs(capturedJsonResponse);
          const safePreview = safeStringifyForLogs(redacted, 1000);
          logLine += ` :: ${safePreview}`;
        } catch {
          // Never let logging failures affect request handling.
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Initialize the app
let isInitialized = false;

const isProduction = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;

async function initializeApp() {
  if (isInitialized) return;
  
  if (isProduction) {
    console.log('Server starting (production)');
  } else {
    console.log('=== SERVER STARTUP DEBUG ===');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('SESSION_SECRET configured:', !!process.env.SESSION_SECRET);
    console.log('SUPABASE_URL configured:', !!process.env.SUPABASE_URL);
  }
  
  try {
    await registerRoutes(app);
    console.log('Routes registered successfully');
  } catch (error) {
    console.error('Error registering routes:', error);
    throw error;
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    // Ignore session store errors about existing indexes/tables or missing relations
    if (err.message && (
      err.message.includes('already exists') || 
      err.message.includes('relation') && err.message.includes('does not exist')
    )) {
      console.warn('Session store warning (non-fatal):', err.message);
      return next();
    }
    
    const status = err.status || err.statusCode || 500;
    const body = getClientErrorBody(err, status === 404 ? "Not found" : "Internal Server Error");
    console.error('Server error:', err);
    res.status(status).json(body);
  });

  // Production mode - only serve static files, no Vite
  // On Vercel, static files are served automatically via rewrites
  // The serverless function only handles API routes
  if (!process.env.VERCEL) {
    serveStatic(app);
  }
  // On Vercel, rewrites handle SPA routing - no need to serve index.html here
  
  isInitialized = true;
}

// Vercel serverless function export
export default async function handler(req: any, res: any) {
  try {
    await initializeApp();
    return app(req, res);
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
