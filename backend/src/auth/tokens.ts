// Random tokens (sessions, one-time links, CSRF) and their hashes. Only the
// SHA-256 of a session or link token is stored, so a leaked database does not
// give access (INV-02 follows the same rule).
import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
