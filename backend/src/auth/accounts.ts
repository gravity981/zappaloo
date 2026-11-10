// Accounts, event roles and one-time links (ACC-04, ACC-06, ACC-08, ACC-14,
// ACC-15; sw-architecture.md 7.1.1).
import { and, eq, gt, or, sql } from "drizzle-orm";
import type { AdminUser, Capability, ProfileUpdate, Role, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  guestGroupMembers,
  guestGroups,
  membershipCapabilities,
  membershipRoles,
  memberships,
  oneTimeLinks,
  users,
} from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import { hashPassword, verifyDummyPassword, verifyPassword } from "./password.ts";
import { hashToken, newToken } from "./tokens.ts";

export type AccountErrorCode =
  | "username_taken"
  | "user_not_found"
  | "invalid_password"
  | "invalid_link"
  | "no_email"
  | "last_admin"
  | "not_staff";

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

/** A transaction of the database, so a caller can make several changes atomically. */
export type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];

export type LinkPurpose = "setup" | "reset" | "verify";

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
    const capabilities = roles.includes("staff")
      ? this.#database.db
          .select({ capability: membershipCapabilities.capability })
          .from(membershipCapabilities)
          .where(
            and(
              eq(membershipCapabilities.eventId, this.#event.eventId),
              eq(membershipCapabilities.userId, row.id),
            ),
          )
          .all()
          .map((c) => c.capability)
          .sort()
      : [];
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      email: row.email,
      emailStatus: row.emailStatus,
      roles,
      capabilities,
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
    input: {
      username: string;
      displayName?: string | undefined;
      roles: Role[];
      /** Redeeming an invitation sets the password at once. */
      passwordHash?: string;
      /** The invitation that grants `vip`; without it `vip` is an admin promotion (INV-11). */
      invitationId?: number;
    },
    actor: Actor,
    /** Inside the transaction of the caller. */
    outer?: Tx,
  ): User {
    const username = input.username.toLowerCase();
    const create = (tx: Tx): User => {
      if (tx.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
        throw new AccountError("username_taken", `the username "${username}" is already taken`);
      }
      const now = this.#now();
      const row = tx
        .insert(users)
        .values({
          username,
          displayName: input.displayName ?? username,
          passwordHash: input.passwordHash ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
      tx.insert(memberships)
        .values({
          eventId: this.#event.eventId,
          userId: row.id,
          createdAt: now,
          ...(input.roles.includes("vip")
            ? {
                vipAssignment:
                  input.invitationId === undefined ? "admin_promotion" : "invitation_code",
                vipInvitationId: input.invitationId ?? null,
              }
            : {}),
        })
        .run();
      for (const role of new Set(input.roles)) {
        tx.insert(membershipRoles)
          .values({ eventId: this.#event.eventId, userId: row.id, role })
          .run();
      }
      this.#event.audit(
        actor,
        "user.create",
        {
          userId: row.id,
          username,
          roles: [...new Set(input.roles)].sort(),
          ...(input.invitationId === undefined ? {} : { invitationId: input.invitationId }),
        },
        tx,
      );
      return this.#toUser(row);
    };
    return outer ? create(outer) : this.#database.db.transaction(create);
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

  /**
   * A new one-time link for the user; older unused links stay valid until they expire.
   * A `verify` link confirms `email`.
   */
  createLink(userId: number, purpose: LinkPurpose, actor: Actor, email?: string): IssuedLink {
    const token = newToken();
    const now = this.#now();
    const expiresAt = new Date(now.getTime() + LINK_VALIDITY_MS);
    this.#database.db.transaction((tx) => {
      tx.insert(oneTimeLinks)
        .values({
          tokenHash: hashToken(token),
          userId,
          purpose,
          email: email ?? null,
          createdAt: now,
          expiresAt,
        })
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
      if (link?.usedAt !== null || link.purpose === "verify" || link.expiresAt <= now) {
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

  /**
   * A link that confirms the user's current, still unverified address (ACC-09).
   * Throws `no_email` if there is nothing to verify.
   */
  createVerification(userId: number): { link: IssuedLink; email: string } {
    const row = this.#database.db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new AccountError("user_not_found", "no such user");
    if (row.email === null || row.emailStatus === "verified") {
      throw new AccountError("no_email", "there is no unverified email address");
    }
    return {
      link: this.createLink(userId, "verify", `user:${String(userId)}`, row.email),
      email: row.email,
    };
  }

  /**
   * Confirms the address with a verification link, once. The link counts only while the
   * profile still has the address it was sent to.
   */
  verifyEmail(token: string): User {
    const now = this.#now();
    return this.#database.db.transaction((tx) => {
      const link = tx
        .select()
        .from(oneTimeLinks)
        .where(eq(oneTimeLinks.tokenHash, hashToken(token)))
        .get();
      if (link?.usedAt !== null || link.purpose !== "verify" || link.expiresAt <= now) {
        throw new AccountError("invalid_link", "the link is unknown, expired or already used");
      }
      tx.update(oneTimeLinks).set({ usedAt: now }).where(eq(oneTimeLinks.id, link.id)).run();
      const row = tx.select().from(users).where(eq(users.id, link.userId)).get();
      if (row?.email !== link.email) {
        throw new AccountError("invalid_link", "the address has changed since the link was sent");
      }
      const updated = tx
        .update(users)
        .set({ emailStatus: "verified", updatedAt: now })
        .where(eq(users.id, row.id))
        .returning()
        .get();
      return this.#toUser(updated);
    });
  }

  /**
   * The accounts a forgotten password can be reset for by email (ACC-03): those whose
   * username or email address is `identifier` and whose address is verified. Others get none,
   * so nothing is sent to an address nobody has proven to own.
   */
  findResettable(identifier: string): { user: User; email: string }[] {
    const needle = identifier.trim().toLowerCase();
    const rows = this.#database.db
      .select()
      .from(users)
      .where(
        and(
          eq(users.emailStatus, "verified"),
          or(eq(users.username, needle), eq(sql`lower(${users.email})`, needle)),
        ),
      )
      .all();
    return rows.flatMap((row) =>
      row.email === null ? [] : [{ user: this.#toUser(row), email: row.email }],
    );
  }

  /** Reset links created for the user in the last `sinceMs` (to limit mails per account). */
  recentResetLinks(userId: number, sinceMs: number): number {
    return this.#database.db
      .select({ id: oneTimeLinks.id })
      .from(oneTimeLinks)
      .where(
        and(
          eq(oneTimeLinks.userId, userId),
          eq(oneTimeLinks.purpose, "reset"),
          gt(oneTimeLinks.createdAt, new Date(this.#now().getTime() - sinceMs)),
        ),
      )
      .all().length;
  }

  /**
   * Deletes the account with everything that hangs on it: membership, roles, sessions
   * and links (ACC-12). The audit log keeps only the user id. The last admin of the event
   * cannot be deleted, so the installation always has someone who can administer it.
   */
  async deleteAccount(userId: number, password: string): Promise<void> {
    const row = this.#database.db.select().from(users).where(eq(users.id, userId)).get();
    if (!row) throw new AccountError("user_not_found", "no such user");
    if (!row.passwordHash || !(await verifyPassword(row.passwordHash, password))) {
      throw new AccountError("invalid_password", "the password is wrong");
    }
    this.#database.db.transaction((tx) => {
      if (this.#isLastAdmin(tx, userId)) {
        throw new AccountError("last_admin", "the last admin cannot delete the account");
      }
      tx.delete(users).where(eq(users.id, userId)).run(); // memberships, roles, sessions, links cascade
      this.#event.audit(`user:${String(userId)}`, "user.delete", { userId }, tx);
    });
  }

  /** True if the user is the only admin of the event. */
  #isLastAdmin(tx: Pick<Database["db"], "select">, userId: number): boolean {
    const admins = tx
      .select({ userId: membershipRoles.userId })
      .from(membershipRoles)
      .where(
        and(eq(membershipRoles.eventId, this.#event.eventId), eq(membershipRoles.role, "admin")),
      )
      .all();
    return admins.length === 1 && admins[0]?.userId === userId;
  }

  /** Every account of the event with its groups (admin overview). */
  listUsers(): AdminUser[] {
    const { db } = this.#database;
    const rows = db
      .select({ user: users, vipAssignment: memberships.vipAssignment })
      .from(users)
      .innerJoin(memberships, eq(memberships.userId, users.id))
      .where(eq(memberships.eventId, this.#event.eventId))
      .orderBy(users.username)
      .all();
    const groups = db
      .select({
        userId: guestGroupMembers.userId,
        id: guestGroups.id,
        name: guestGroups.name,
      })
      .from(guestGroupMembers)
      .innerJoin(guestGroups, eq(guestGroups.id, guestGroupMembers.groupId))
      .where(eq(guestGroups.eventId, this.#event.eventId))
      .orderBy(guestGroups.name)
      .all();
    return rows.map(({ user, vipAssignment }) => ({
      ...this.#toUser(user),
      vipAssignment,
      groups: groups.filter((g) => g.userId === user.id).map(({ id, name }) => ({ id, name })),
    }));
  }

  /**
   * Sets the complete set of roles of the user (ROLE-01, ROLE-04, ROLE-09). Roles the admin
   * leaves in the set stay as they are, so revoking one never touches another. The last admin
   * keeps the role. Removing `staff` also switches off the staff capabilities.
   */
  setRoles(userId: number, roles: Role[], actor: Actor): User {
    const wanted = [...new Set(roles)];
    return this.#database.db.transaction((tx) => {
      const row = tx.select().from(users).where(eq(users.id, userId)).get();
      if (!row) throw new AccountError("user_not_found", "no such user");
      const current = this.#toUser(row).roles;
      if (current.includes("admin") && !wanted.includes("admin") && this.#isLastAdmin(tx, userId)) {
        throw new AccountError("last_admin", "the last admin cannot lose the admin role");
      }
      const eventId = this.#event.eventId;
      for (const role of current.filter((r) => !wanted.includes(r))) {
        tx.delete(membershipRoles)
          .where(
            and(
              eq(membershipRoles.eventId, eventId),
              eq(membershipRoles.userId, userId),
              eq(membershipRoles.role, role),
            ),
          )
          .run();
      }
      for (const role of wanted.filter((r) => !current.includes(r))) {
        tx.insert(membershipRoles).values({ eventId, userId, role }).run();
      }
      // Direct promotion needs no code; revoking vip forgets how it was granted (INV-11).
      const gainedVip = wanted.includes("vip") && !current.includes("vip");
      if (gainedVip || (!wanted.includes("vip") && current.includes("vip"))) {
        tx.update(memberships)
          .set(
            gainedVip
              ? { vipAssignment: "admin_promotion", vipInvitationId: null }
              : { vipAssignment: null, vipInvitationId: null },
          )
          .where(and(eq(memberships.eventId, eventId), eq(memberships.userId, userId)))
          .run();
      }
      if (!wanted.includes("staff")) {
        tx.delete(membershipCapabilities)
          .where(
            and(
              eq(membershipCapabilities.eventId, eventId),
              eq(membershipCapabilities.userId, userId),
            ),
          )
          .run();
      }
      this.#event.audit(
        actor,
        "user.roles",
        {
          userId,
          from: current,
          to: [...wanted].sort(),
          ...(wanted.includes("vip") && !current.includes("vip")
            ? { vipAssignment: "admin_promotion" }
            : {}),
        },
        tx,
      );
      return this.#toUser(row);
    });
  }

  /** Sets the complete set of capabilities of a staff member (ROLE-06). */
  setCapabilities(userId: number, capabilities: Capability[], actor: Actor): User {
    const wanted = [...new Set(capabilities)];
    return this.#database.db.transaction((tx) => {
      const row = tx.select().from(users).where(eq(users.id, userId)).get();
      if (!row) throw new AccountError("user_not_found", "no such user");
      const before = this.#toUser(row);
      if (!before.roles.includes("staff")) {
        throw new AccountError("not_staff", "capabilities belong to staff members");
      }
      const eventId = this.#event.eventId;
      tx.delete(membershipCapabilities)
        .where(
          and(
            eq(membershipCapabilities.eventId, eventId),
            eq(membershipCapabilities.userId, userId),
          ),
        )
        .run();
      for (const capability of wanted) {
        tx.insert(membershipCapabilities).values({ eventId, userId, capability }).run();
      }
      this.#event.audit(
        actor,
        "user.capabilities",
        { userId, from: before.capabilities, to: [...wanted].sort() },
        tx,
      );
      return this.#toUser(row);
    });
  }
}
