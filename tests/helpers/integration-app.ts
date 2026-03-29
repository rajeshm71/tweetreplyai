import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { setupRoutes } from "../../server/routes.js";

/**
 * Express app wired like production: raw body for Dodo + Resend webhooks before JSON parser, fully awaited route registration.
 * `cookie-parser` matches prod so JWT/session cookies work for `/api/extension/auth` and cookie-based flows.
 */
export async function createIntegrationApp(): Promise<Express> {
  const app = express();
  app.set("trust proxy", 1);
  app.use("/api/dodo/webhook", express.raw({ type: "application/json" }));
  app.use("/api/webhooks/resend", express.raw({ type: "application/json" }));
  app.use(cookieParser());
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  await setupRoutes(app);
  return app;
}
