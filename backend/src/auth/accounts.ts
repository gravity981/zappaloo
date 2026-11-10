// Accounts, event roles and one-time links (ACC-04, ACC-06, ACC-08, ACC-14,
// ACC-15; sw-architecture.md 7.1.1).
import { and, eq } from "drizzle-orm";
import type { ProfileUpdate, Role, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { membershipRoles, memberships, oneTimeLinks, users } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password.ts";
import { hashToken, newToken } from "./tokens.ts";

export type AccountErrorCode =
  "username_taken" | "user_not_found" | "invalid_password" | "invalid_link";

export class AccountError extends Error {
  override name = "AccountError";
  readonly code: AccountErrorCode;
  constructor(code: AccountErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** A one-time link is valid for 24 hours (sw-architecture.md 7.1.1). */
export const LINK_VALIDITY_MS = 24 * 60 * 60 * 1000;

export type LinkPurpose = "setup" | "reset";

export interface IssuedLink {
  token: string;
  expiresAt: Date;
}

type UserRow = typeof users.$inferSelect;

export class AccountService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #now: () => Date;

  constructor(database: Database, event: EventService, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#event = event;
    this.#now = now;
  }

  /** The user as the API shows it, with the roles in this installation's event. */
  #toUser(row: UserRow): User {
    const roles = this.#database.db
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(
        and(eq(membershipRoles.eventId, this.#event.eventId), eq(membershipRoles.userId, row.id)),
      )
      .all()
      .map((r) => r.role)
      .sort();
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      email: row.email,
      emailStatus: row.emailStatus,
      roles,
    };
  }

  getUser(id: number): User | undefined {
    const row = this.#database.db.select().from(users).where(eq(users.id, id)).get();
    return row && this.#toUser(row);
  }

  findUser(username: string): User | undefined {
    const row = this.#database.db
      .select()
      .from(users)
      .where(eq(users.username, username.toLowerCase()))
      .get();
    return row && this.#toUser(row);
  }

  /**
   * Creates an account without a password and with a membership of the event with
   * `roles`. Its owner sets the password with a setup link (see `createLink`).
   */
  createUser(
    input: { username: string; displayName?: string | undefined; roles: Role[] },
    actor: Actor,
  ): User {
    const username = input.username.toLowerCase();
    return this.#database.db.transaction((tx) => {
      if (tx.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
        throw new AccountError("username_taken", `the username "${username}" is already taken`);
      }
      const now = this.#now();
      const row = tx
        .insert(users)
        .values({
          username,
          displayName: input.displayName ?? username,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(memberships)
        .values({ eventId: this.#event.eventId, userId: row.id, createdAt: now })
        .run();
      for (const role of new Set(input.roles)) {
        tx.insert(membershipRoles)
          .values({ eventId: this.#event.eventId, userId: row.id, role })
          .run();
      }
      this.#event.audit(
        actor,
        "user.create",
        { userId: row.id, username, roles: [...new Set(input.roles)].sort() },
        tx,
      );
      return this.#toUser(row);
    });
  }

  /** Checks username and password; always does the hashing work, also for unknown users. */
  async verifyLogin(username: string, password: string): Promise<User | undefined> {
    const row = this.#database.db
      .select()
      .from(users)
      .where(eq(users.username, username.trim().toLowerCase()))
      .get();
    if (!row?.passwordHash) {
      await verifyDummyPassword(password);
      return undefined;
    }
    return (await verifyPassword(row.passwordHash, password)) ? this.#toUser(row) : undefined;
  }

  updateProfile(userId: number, update: ProfileUpdate): User {
    const row = this.#database.db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new AccountError("user_not_found", "no such user");
    const changes: Partial<typeof users.$inferInsert> = { updatedAt: this.#now() };
    if (update.displayName !== undefined) changes.displayName = update.displayName;
    if (update.email !== undefined) {
      // A new or removed address is not verified (verification: step 2c).
      if (update.email !== row.email) {
        changes.email = update.email;
        changes.emailStatus = "unverified";
      }
    }
    const updated = this.#database.db
      .update(users)
      .set(changes)
      .where(eq(users.id, userId))
      .returning()
      .get();
    return this.#toUser(updated);
  }

  /** Changes the password after checking the current one. */
  async changePassword(userId: number, current: string, next: string): Promise<void> {
    const row = this.#database.db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new AccountError("user_not_found", "no such user");
    if (!row.passwordHash || !(await verifyPassword(row.passwordHash, current))) {
      throw new AccountError("invalid_password", "the current password is wrong");
    }
    await this.#setPassword(userId, next);
  }

  async #setPassword(userId: number, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    this.#database.db
      .update(users)
      .set({ passwordHash, updatedAt: this.#now() })
      .where(eq(users.id, userId))
      .run();
  }

  /** A new one-time link for the user; older unused links stay valid until they expire. */
  createLink(userId: number, purpose: LinkPurpose, actor: Actor): IssuedLink {
    const token = newToken();
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + LINK_VALIDITY_MS);
    this.#database.db.transaction((tx) => {
      tx.insert(oneTimeLinks)
        .values({ tokenHash: hashToken(token), userId, purpose, createdAt: now, expiresAt })
        .run();
      this.#event.audit(actor, "link.create", { userId, purpose }, tx);
    });
    return { token, expiresAt };
  }

  /**
   * Sets the password with a one-time link, once: an unknown, used or expired link is refused.
   * Returns the user, whose sessions the caller ends.
   */
  async useLink(token: string, password: string): Promise<User> {
    const passwordHash = await hashPassword(password);
    const now = this.#now();
    return this.#database.db.transaction((tx) => {
      const link = tx
        .select()
        .from(oneTimeLinks)
        .where(eq(oneTimeLinks.tokenHash, hashToken(token)))
        .get();
      if (link?.usedAt !== null || link.expiresAt <= now) {
        throw new AccountError("invalid_link", "the link is unknown, expired or already used");
      }
      tx.update(oneTimeLinks).set({ usedAt: now }).where(eq(oneTimeLinks.id, link.id)).run();
      const row = tx
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(eq(users.id, link.userId))
        .returning()
        .get();
      return this.#toUser(row);
    });
  }
}
