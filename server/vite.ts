import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { nanoid } from "nanoid";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Skip Vite setup in production
  if (process.env.NODE_ENV === 'production') {
    console.log('Skipping Vite setup in production mode');
    return;
  }

  try {
    // Dynamic import only in development
    const { createServer: createViteServer, createLogger } = await import("vite");
    const viteConfig = (await import("../vite.config.js")).default;
    
    const viteLogger = createLogger();
    
    const serverOptions = {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: true as const,
    };

    const vite = await createViteServer({
      ...viteConfig,
      configFile: false,
      customLogger: {
        ...viteLogger,
        error: (msg, options) => {
          viteLogger.error(msg, options);
          process.exit(1);
        },
      },
      server: serverOptions,
      appType: "custom",
    });

    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;

      try {
        const clientTemplate = path.resolve(
          import.meta.dirname,
          "..",
          "client",
          "index.html"
        );
        let template = fs.readFileSync(clientTemplate, "utf-8");

        template = await vite.transformIndexHtml(url, template);

        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } catch (error) {
    console.error('Failed to setup Vite:', error);
    console.log('Continuing without Vite middleware');
  }
}

export function serveStatic(app: Express) {
  // In production (Vercel), the compiled server is at dist/index.js
  // and the public files are at dist/public
  // In development, we're in server/ and the build is at dist/public
  let distPath: string;
  
  if (process.env.NODE_ENV === 'production') {
    // When running from dist/index.js, public files are in ./public relative to the compiled file
    distPath = path.resolve(import.meta.dirname, "public");
  } else {
    // In development, resolve from server/ to dist/public
    distPath = path.resolve(import.meta.dirname, "..", "dist", "public");
  }

  console.log(`Attempting to serve static files from: ${distPath}`);

  if (!fs.existsSync(distPath)) {
    console.warn(`Build directory not found: ${distPath}, serving API only`);
    // Serve a simple message for the root route
    app.use("*", (_req, res) => {
      res.json({ message: "API is running, but frontend build not found" });
    });
    return;
  }

  console.log(`Successfully found static files directory at: ${distPath}`);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}