import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
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

