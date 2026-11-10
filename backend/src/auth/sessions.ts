// Server-side sessions (ACC-05, ACC-13; sw-architecture.md 7.1.1): a random token
// in the cookie, only its SHA-256 in the database; 365 days, renewed on use.
import { and, eq, lte, ne } from "drizzle-orm";
import type { Database } from "../database/database.ts";
import { sessions } from "../database/schema.ts";
import { hashToken, newToken } from "./tokens.ts";

export const SESSION_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
/** A session is renewed at most this often. */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ActiveSession {
  userId: number;
  csrfToken: string;
  expiresAt: Date;
  /** The expiry was extended: the cookie is set again. */
  renewed: boolean;
}

export class SessionService {
  readonly #database: Database;
  readonly #now: () => Date;

  constructor(database: Database, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#now = now;
  }

  /** Starts a session; the token goes into the cookie, nowhere else. */
  create(userId: number): { token: string; csrfToken: string; expiresAt: Date } {
    const token = newToken();
    const csrfToken = newToken();
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    this.#database.db
      .insert(sessions)
      .values({
        tokenHash: hashToken(token),
        userId,
        csrfToken,
        createdAt: now,
        lastUsedAt: now,
        expiresAt,
      })
      .run();
    return { token, csrfToken, expiresAt };
  }

  /** The session of a token, if it exists and has not expired; renews it once a day. */
  resolve(token: string): ActiveSession | undefined {
    const tokenHash = hashToken(token);
    const row = this.#database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, tokenHash))
      .get();
    const now = this.#now();
    if (!row) return undefined;
    if (row.expiresAt <= now) {
      this.#database.db.delete(sessions).where(eq(sessions.tokenHash, tokenHash)).run();
      return undefined;
    }
    let expiresAt = row.expiresAt;
    let renewed = false;
    if (now.getTime() - row.lastUsedAt.getTime() >= RENEW_AFTER_MS) {
      expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
      this.#database.db
        .update(sessions)
        .set({ lastUsedAt: now, expiresAt })
        .where(eq(sessions.tokenHash, tokenHash))
        .run();
      renewed = true;
    }
    return { userId: row.userId, csrfToken: row.csrfToken, expiresAt, renewed };
  }

  destroy(token: string): void {
    this.#database.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)))
      .run();
  }

  /** Deletes the expired sessions nobody presented again. Returns how many were deleted. */
  purgeExpired(): number {
    return this.#database.db.delete(sessions).where(lte(sessions.expiresAt, this.#now())).run()
      .changes;
  }

  /** Ends all sessions of the user, except the one with `keepToken` (password change). */
  destroyForUser(userId: number, keepToken?: string): void {
    const condition = keepToken
      ? and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(keepToken)))
      : eq(sessions.userId, userId);
    this.#database.db.delete(sessions).where(condition).run();
  }
}
