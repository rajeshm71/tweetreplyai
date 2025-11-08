import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic, log } from "./static.js";
import path from "path";
import fs from "fs";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

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
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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

async function initializeApp() {
  if (isInitialized) return;
  
  console.log('=== SERVER STARTUP DEBUG ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('SESSION_SECRET configured:', !!process.env.SESSION_SECRET);
  console.log('SUPABASE_URL configured:', !!process.env.SUPABASE_URL);
  
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
    const message = err.message || "Internal Server Error";
    
    console.error('Server error:', err);
    res.status(status).json({ message });
  });

  // Production mode - only serve static files, no Vite
  // Skip static serving in Vercel - Vercel handles this automatically via @vercel/static
  if (!process.env.VERCEL) {
    serveStatic(app);
  } else {
    // On Vercel, serve index.html for non-API routes (SPA routing)
    // Static files are served by @vercel/static, but we need to serve index.html for SPA routes
    app.get('*', (req, res, next) => {
      // Skip API routes - they're handled by registerRoutes
      if (req.path.startsWith('/api')) {
        return next();
      }
      // Skip static assets - they're served by @vercel/static
      if (req.path.startsWith('/assets') || req.path.endsWith('.css') || req.path.endsWith('.js')) {
        return next();
      }
      // Serve index.html for SPA routes
      const indexPath = path.join(process.cwd(), 'dist', 'public', 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        next();
      }
    });
  }
  
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
