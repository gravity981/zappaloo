// Personal invitation codes (INV-01 – INV-12; sw-architecture.md 9). The code is a random
// 6-character string; only its SHA-256 is stored, so the plain code exists only in the
// response that creates or regenerates it (INV-02, INV-14).
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Invitation, InvitationStatus, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { invitations, membershipRoles, memberships } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { AccountService } from "./accounts.ts";
import { hashPassword } from "./password.ts";
import { hashToken } from "./tokens.ts";

export type InvitationErrorCode =
  | "invalid_invitation"
  | "invitation_expired"
  | "invitation_redeemed"
  | "invitation_revoked"
  | "invitation_replaced"
  | "already_vip"
  | "invitation_not_found"
  | "not_regenerable"
  | "not_revocable";

export class InvitationError extends Error {
  override name = "InvitationError";
  readonly code: InvitationErrorCode;
  constructor(code: InvitationErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** 32 letters and digits without look-alikes (no 0/O, 1/I): 5 bits per character. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;

/** A new random code: 30 bits, e.g. `K7QMX4`. */
export function newInvitationCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  const chars = Array.from(bytes, (byte) => ALPHABET.charAt(byte % 32)); // 256 = 8 * 32: uniform
  return chars.join("");
}

/** The code as stored and compared: capitals without dashes or spaces; undefined if malformed. */
export function normalizeCode(input: string): string | undefined {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  return code.length === CODE_LENGTH && Array.from(code).every((c) => ALPHABET.includes(c))
    ? code
    : undefined;
}

type Row = typeof invitations.$inferSelect;
type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];

export interface IssuedCode {
  invitation: Invitation;
  /** The plain code; never stored. */
  code: string;
}

export class InvitationService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #accounts: AccountService;
  readonly #now: () => Date;

  constructor(
    database: Database,
    event: EventService,
    accounts: AccountService,
    now: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#event = event;
    this.#accounts = accounts;
    this.#now = now;
  }

  #status(row: Row): InvitationStatus {
    if (row.status === "active" && row.expiresAt && row.expiresAt <= this.#now()) return "expired";
    return row.status;
  }

  #toInvitation(row: Row): Invitation {
    return {
      id: row.id,
      guestName: row.guestName,
      note: row.note,
      status: this.#status(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      redeemedAt: row.redeemedAt?.toISOString() ?? null,
      redeemedBy: row.redeemedBy,
    };
  }

  list(): Invitation[] {
    return this.#database.db
      .select()
      .from(invitations)
      .where(eq(invitations.eventId, this.#event.eventId))
      .orderBy(desc(invitations.id))
      .all()
      .map((row) => this.#toInvitation(row));
  }

  /** One invitation per guest, all with the same optional expiry date (INV-01, INV-04). */
  create(
    guests: { name: string; note?: string | undefined }[],
    expiresAt: Date | undefined,
    actor: Actor,
  ): IssuedCode[] {
    return this.#database.db.transaction((tx) =>
      guests.map((guest) => {
        const issued = this.#insert(tx, guest.name, guest.note ?? null, expiresAt);
        this.#event.audit(
          actor,
          "invitation.create",
          { invitationId: issued.invitation.id, guestName: guest.name },
          tx,
        );
        return issued;
      }),
    );
  }

  #insert(tx: Tx, guestName: string, note: string | null, expiresAt: Date | undefined): IssuedCode {
    const code = newInvitationCode();
    const row = tx
      .insert(invitations)
      .values({
        eventId: this.#event.eventId,
        guestName,
        note,
        codeHash: hashToken(normalizeCode(code) ?? code),
        expiresAt: expiresAt ?? null,
        createdAt: this.#now(),
      })
      .returning()
      .get();
    return { invitation: this.#toInvitation(row), code };
  }

  #get(tx: Pick<Database["db"], "select">, id: number): Row {
    const row = tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.id, id), eq(invitations.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new InvitationError("invitation_not_found", "no such invitation");
    return row;
  }

  /** Revokes an active or expired code; a redeemed code stays redeemed (INV-05, INV-10). */
  revoke(id: number, actor: Actor): Invitation {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      if (row.status !== "active") {
        throw new InvitationError("not_revocable", `a ${row.status} code cannot be revoked`);
      }
      const updated = tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(and(eq(invitations.id, id), eq(invitations.status, "active")))
        .returning()
        .get();
      this.#event.audit(actor, "invitation.revoke", { invitationId: id }, tx);
      return this.#toInvitation(updated);
    });
  }

  /**
   * Replaces an active or expired code by a new one for the same guest; the old code becomes
   * `replaced` and no longer works (INV-05). The new code has the given expiry, or none.
   */
  regenerate(id: number, expiresAt: Date | undefined, actor: Actor): IssuedCode {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      if (row.status !== "active") {
        throw new InvitationError("not_regenerable", `a ${row.status} code cannot be regenerated`);
      }
      const issued = this.#insert(tx, row.guestName, row.note, expiresAt);
      tx.update(invitations)
        .set({ status: "replaced", replacedBy: issued.invitation.id })
        .where(eq(invitations.id, id))
        .run();
      this.#event.audit(
        actor,
        "invitation.regenerate",
        { invitationId: id, newInvitationId: issued.invitation.id },
        tx,
      );
      return issued;
    });
  }

  /** The invitation of a typed or scanned code, if it is a valid code at all. */
  #find(tx: Pick<Database["db"], "select">, input: string): Row {
    const code = normalizeCode(input);
    const row =
      code &&
      tx
        .select()
        .from(invitations)
        .where(
          and(
            eq(invitations.codeHash, hashToken(code)),
            eq(invitations.eventId, this.#event.eventId),
          ),
        )
        .get();
    if (!row) throw new InvitationError("invalid_invitation", "this code is not valid");
    return row;
  }

  #assertRedeemable(row: Row): void {
    const status = this.#status(row);
    if (status !== "active") {
      throw new InvitationError(`invitation_${status}`, `this code is ${status}`);
    }
  }

  /** What a guest sees before redeeming; refuses a code that cannot be redeemed (INV-03, INV-04). */
  preview(input: string): { guestName: string } {
    const row = this.#find(this.#database.db, input);
    this.#assertRedeemable(row);
    return { guestName: row.guestName };
  }

  /**
   * A new guest registers and redeems the code in one step (INV-07): the account is created
   * with `vip` and the code is marked redeemed in one transaction (INV-08).
   */
  async redeemWithNewAccount(
    input: string,
    account: { username: string; displayName?: string | undefined; password: string },
  ): Promise<User> {
    const passwordHash = await hashPassword(account.password);
    return this.#database.db.transaction((tx) => {
      const row = this.#find(tx, input);
      this.#assertRedeemable(row);
      const user = this.#accounts.createUser(
        {
          username: account.username,
          displayName: account.displayName ?? row.guestName,
          roles: ["vip"],
          passwordHash,
          invitationId: row.id,
        },
        `user:${account.username.toLowerCase()}`,
        tx,
      );
      this.#markRedeemed(tx, row.id, user.id);
      return user;
    });
  }

  /**
   * A signed-in user without `vip` redeems the code and keeps their account (INV-07, ACC-07).
   */
  redeemForUser(input: string, userId: number): User {
    return this.#database.db.transaction((tx) => {
      const row = this.#find(tx, input);
      this.#assertRedeemable(row);
      const eventId = this.#event.eventId;
      const has = tx
        .select()
        .from(membershipRoles)
        .where(
          and(
            eq(membershipRoles.eventId, eventId),
            eq(membershipRoles.userId, userId),
            eq(membershipRoles.role, "vip"),
          ),
        )
        .get();
      if (has) throw new InvitationError("already_vip", "this account already is a VIP");
      tx.insert(membershipRoles).values({ eventId, userId, role: "vip" }).run();
      tx.update(memberships)
        .set({ vipAssignment: "invitation_code", vipInvitationId: row.id })
        .where(and(eq(memberships.eventId, eventId), eq(memberships.userId, userId)))
        .run();
      this.#markRedeemed(tx, row.id, userId);
      this.#event.audit(
        `user:${String(userId)}`,
        "user.roles",
        { userId, vipAssignment: "invitation_code", invitationId: row.id },
        tx,
      );
      const user = this.#accounts.getUser(userId);
      if (!user) throw new InvitationError("invalid_invitation", "no such user");
      return user;
    });
  }

  /** Only one transaction can flip `active` to `redeemed`: the update checks the status (INV-08). */
  #markRedeemed(tx: Pick<Database["db"], "update">, id: number, userId: number): void {
    const done = tx
      .update(invitations)
      .set({ status: "redeemed", redeemedAt: this.#now(), redeemedBy: userId })
      .where(and(eq(invitations.id, id), eq(invitations.status, "active")))
      .run();
    if (done.changes !== 1) {
      throw new InvitationError("invitation_redeemed", "this code is redeemed");
    }
  }
}
