import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { registerRoutes } from "./routes.js";
import { serveStatic, log } from "./static.js";
import { getClientErrorBody } from "./config/env.js";
import cors from "cors";
import { corsApiOptions } from "./config/cors.js";
import { redactForLogs, safeStringifyForLogs } from "./utils/logging.js";
import { registerCrashHandlers } from "./utils/crashHandlers.js";
import { initSentry, Sentry } from "./utils/sentry.js";
import { HTTP } from "./config/constants.js";

initSentry();
registerCrashHandlers();

const app = express();

// Trust first proxy (e.g. Vercel) so X-Forwarded-For is used and express-rate-limit can identify clients
app.set('trust proxy', 1);

// Apply raw body parser for webhook routes BEFORE json parser
// This is critical for webhook signature verification (Dodo, Resend/Svix)
app.use('/api/dodo/webhook', express.raw({ type: 'application/json' }));
app.use('/api/webhooks/resend', express.raw({ type: 'application/json' }));

// Apply JSON parser for all other routes
app.use(express.json({ limit: HTTP.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: false }));

app.use('/api', cors(corsApiOptions));

// Sentry user tagging is applied inside the auth middleware (see
// jwtIsAuthenticated in routes.ts) so req.user is populated first.

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

(async () => {
  const appWithRoutes = await registerRoutes(app);
  const server = createServer(appWithRoutes);

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
    const body = getClientErrorBody(err, "Internal Server Error");
    console.error('Server error:', err);
    if (status >= 500) {
      try {
        Sentry.captureException(err);
      } catch {
        // ignore Sentry failures
      }
    }
    res.status(status).json(body);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    // Dynamically import vite only in development to avoid bundling it
    const { setupVite } = await import("./vite.js");
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.NODE_ENV === 'development' ? 'localhost' : '0.0.0.0';
  
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });
})();
