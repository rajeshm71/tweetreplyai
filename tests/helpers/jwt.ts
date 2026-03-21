import jwt from "jsonwebtoken";
import { getSessionSecret } from "../../server/config/env.js";

export function signJwt(payload: { id: string; email?: string }) {
  // Server routes sign JWT payload as: { id, email }
  return jwt.sign(payload, getSessionSecret(), { expiresIn: "7d" });
}

export function signTestJwt(user: { id: string; email?: string } = { id: "test-user" }) {
  return signJwt(user);
}

