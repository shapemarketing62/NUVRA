import "server-only";
import { createHash, randomBytes } from "crypto";
export function createSecureToken() { const token = randomBytes(32).toString("base64url"); return { token, hash: hashToken(token) }; }
export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
