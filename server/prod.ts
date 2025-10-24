import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes.js";
import { serveStatic, log } from "./static.js";

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

(async () => {
  console.log('=== SERVER STARTUP DEBUG ===');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', process.env.PORT);
  console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL);
  console.log('SESSION_SECRET configured:', !!process.env.SESSION_SECRET);
  console.log('DATABASE_URL configured:', !!process.env.DATABASE_URL);
  console.log('SUPABASE_URL configured:', !!process.env.SUPABASE_URL);
  
  // Debug DATABASE_URL format
  if (process.env.DATABASE_URL) {
    console.log('DATABASE_URL format check:');
    console.log('- Contains postgres://:', process.env.DATABASE_URL.includes('postgres://'));
    console.log('- Contains :5432:', process.env.DATABASE_URL.includes(':5432'));
    console.log('- Contains :6543:', process.env.DATABASE_URL.includes(':6543'));
    console.log('- Contains pooler:', process.env.DATABASE_URL.includes('pooler'));
    console.log('- Contains aws-0:', process.env.DATABASE_URL.includes('aws-0'));
    console.log('- URL preview:', process.env.DATABASE_URL.replace(/\/\/.*@/, '//***:***@'));
  }
  
  try {
    const server = await registerRoutes(app);
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
  serveStatic(app);

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.NODE_ENV === 'development' ? 'localhost' : '0.0.0.0';
  
  server.listen({
    port,
    host,
    reusePort: process.env.NODE_ENV !== 'development',
  }, () => {
    log(`serving on ${host}:${port}`);
  });
})();
