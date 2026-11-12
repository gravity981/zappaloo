// Personal invitation codes (INV-01 – INV-12; sw-architecture.md 9). The code is a random
// 6-character string; only its SHA-256 is stored, so the plain code exists only in the
// response that creates or regenerates it (INV-02, INV-14).
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Invitation, InvitationStatus, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  programItems,
  invitationProgramItems,
  invitations,
  membershipProgramItems,
  membershipRoles,
  memberships,
} from "../database/schema.ts";
import { SELF_ACTOR } from "../event/service.ts";
import type { Actor, EventService } from "../event/service.ts";
import { attendingNow, pruneAnswers } from "../rsvp/cleanup.ts";
import { assertPasswordAllowed } from "./accounts.ts";
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
  | "not_revocable"
  | "program_item_not_found"
  | "program_items_not_editable";

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
  readonly #newCode: () => string;

  constructor(
    database: Database,
    event: EventService,
    accounts: AccountService,
    now: () => Date = () => new Date(),
    /** Draws a new code (tests replace it to force a collision). */
    newCode: () => string = newInvitationCode,
  ) {
    this.#database = database;
    this.#event = event;
    this.#accounts = accounts;
    this.#now = now;
    this.#newCode = newCode;
  }

  #status(row: Row): InvitationStatus {
    if (row.status === "active" && row.expiresAt && row.expiresAt <= this.#now()) return "expired";
    return row.status;
  }

  #toInvitation(row: Row, programItemIds: number[]): Invitation {
    return {
      id: row.id,
      guestName: row.guestName,
      note: row.note,
      status: this.#status(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      redeemedAt: row.redeemedAt?.toISOString() ?? null,
      redeemedBy: row.redeemedBy,
      programItemIds,
    };
  }

  /**
   * The program items of an invitation: its own list, or, once redeemed, those of the account that
   * redeemed it, which the admin can also change in the account panel (RSVP-02).
   */
  #programItemIds(tx: Pick<Database["db"], "select">, row: Row): number[] {
    const eventId = this.#event.eventId;
    const rows =
      row.status === "redeemed" && row.redeemedBy !== null
        ? tx
            .select({ programItemId: membershipProgramItems.programItemId })
            .from(membershipProgramItems)
            .where(
              and(
                eq(membershipProgramItems.eventId, eventId),
                eq(membershipProgramItems.userId, row.redeemedBy),
              ),
            )
            .all()
        : tx
            .select({ programItemId: invitationProgramItems.programItemId })
            .from(invitationProgramItems)
            .where(eq(invitationProgramItems.invitationId, row.id))
            .all();
    return rows.map((r) => r.programItemId).sort((a, b) => a - b);
  }

  list(): Invitation[] {
    const { db } = this.#database;
    return db
      .select()
      .from(invitations)
      .where(eq(invitations.eventId, this.#event.eventId))
      .orderBy(desc(invitations.id))
      .all()
      .map((row) => this.#toInvitation(row, this.#programItemIds(db, row)));
  }

  /** Every program item of the event must exist; undefined means all program items (RSVP-02). */
  #resolveProgramItems(
    tx: Pick<Database["db"], "select">,
    programItemIds: number[] | undefined,
  ): number[] {
    const all = tx
      .select({ id: programItems.id })
      .from(programItems)
      .where(eq(programItems.eventId, this.#event.eventId))
      .all()
      .map((r) => r.id);
    if (programItemIds === undefined) return all.sort((a, b) => a - b);
    const wanted = [...new Set(programItemIds)].sort((a, b) => a - b);
    if (wanted.some((id) => !all.includes(id))) {
      throw new InvitationError("program_item_not_found", "no such program item");
    }
    return wanted;
  }

  /** One invitation per guest, all with the same optional expiry date (INV-01, INV-04). */
  create(
    guests: { name: string; note?: string | undefined }[],
    expiresAt: Date | undefined,
    actor: Actor,
    /** The program items the guests are invited to; undefined: all program items of the event. */
    programItemIds?: number[],
  ): IssuedCode[] {
    return this.#database.db.transaction((tx) => {
      const programItems = this.#resolveProgramItems(tx, programItemIds);
      return guests.map((guest) => {
        const issued = this.#insert(tx, guest.name, guest.note ?? null, expiresAt, programItems);
        // The id only: the guest's name is in the invitation, not copied into the log.
        this.#event.audit(actor, "invitation.create", { invitationId: issued.invitation.id }, tx);
        return issued;
      });
    });
  }

  /**
   * A code no invitation has had yet. With a few hundred codes among about a billion a
   * collision is rare, but it would fail the whole batch on the unique index; so draw again.
   */
  #unusedCode(tx: Pick<Database["db"], "select">): string {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const code = this.#newCode();
      const taken = tx
        .select({ id: invitations.id })
        .from(invitations)
        .where(eq(invitations.codeHash, hashToken(code)))
        .get();
      if (!taken) return code;
    }
    throw new Error("no unused invitation code found in 10 attempts");
  }

  #insert(
    tx: Tx,
    guestName: string,
    note: string | null,
    expiresAt: Date | undefined,
    programItemIds: number[],
  ): IssuedCode {
    const code = this.#unusedCode(tx);
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
    for (const programItemId of programItemIds) {
      tx.insert(invitationProgramItems)
        .values({ eventId: this.#event.eventId, invitationId: row.id, programItemId })
        .run();
    }
    return { invitation: this.#toInvitation(row, programItemIds), code };
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

  /**
   * Revokes an active code (INV-05). An expired code needs no revoking, a redeemed one stays
   * redeemed (INV-10), and a revoked or replaced one is already dead (9.6.1).
   */
  revoke(id: number, actor: Actor): Invitation {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      const status = this.#status(row);
      if (status !== "active") {
        throw new InvitationError("not_revocable", `a ${status} code cannot be revoked`);
      }
      const updated = tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(and(eq(invitations.id, id), eq(invitations.status, "active")))
        .returning()
        .get();
      this.#event.audit(actor, "invitation.revoke", { invitationId: id }, tx);
      return this.#toInvitation(updated, this.#programItemIds(tx, updated));
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
      const issued = this.#insert(
        tx,
        row.guestName,
        row.note,
        expiresAt,
        this.#programItemIds(tx, row),
      );
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

  /**
   * Changes the program items of an invitation (RSVP-02, UX decision 31): its own list while the code
   * is active or expired, the account's program items once it is redeemed. A revoked or replaced code
   * is dead and keeps what it had.
   */
  setProgramItems(id: number, programItemIds: number[], actor: Actor): Invitation {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      const status = this.#status(row);
      if (status === "revoked" || status === "replaced") {
        throw new InvitationError(
          "program_items_not_editable",
          `a ${status} code cannot be changed`,
        );
      }
      const programItems = this.#resolveProgramItems(tx, programItemIds);
      const eventId = this.#event.eventId;
      tx.delete(invitationProgramItems).where(eq(invitationProgramItems.invitationId, id)).run();
      for (const programItemId of programItems) {
        tx.insert(invitationProgramItems)
          .values({ eventId, invitationId: id, programItemId })
          .run();
      }
      if (row.status === "redeemed" && row.redeemedBy !== null) {
        const before = attendingNow(tx, eventId, row.redeemedBy);
        tx.delete(membershipProgramItems)
          .where(
            and(
              eq(membershipProgramItems.eventId, eventId),
              eq(membershipProgramItems.userId, row.redeemedBy),
            ),
          )
          .run();
        for (const programItemId of programItems) {
          tx.insert(membershipProgramItems)
            .values({ eventId, userId: row.redeemedBy, programItemId })
            .run();
        }
        // Answers for program items no longer invited go, as with the account panel (7.4.1).
        pruneAnswers(tx, eventId, row.redeemedBy, before);
      }
      this.#event.audit(
        actor,
        "invitation.program_items",
        { invitationId: id, programItemIds: programItems },
        tx,
      );
      return this.#toInvitation(row, this.#programItemIds(tx, row));
    });
  }

  /** The invitation's program items become the program items of the guest who redeemed it. */
  #copyProgramItemsToMember(tx: Tx, invitationId: number, userId: number): void {
    const eventId = this.#event.eventId;
    const rows = tx
      .select({ programItemId: invitationProgramItems.programItemId })
      .from(invitationProgramItems)
      .where(eq(invitationProgramItems.invitationId, invitationId))
      .all();
    for (const { programItemId } of rows) {
      tx.insert(membershipProgramItems)
        .values({ eventId, userId, programItemId })
        .onConflictDoNothing()
        .run();
    }
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
    account: {
      username: string;
      displayName?: string | undefined;
      password: string;
      email?: string | undefined;
    },
  ): Promise<User> {
    // Code and password are checked before the (expensive) hashing, and again in the transaction.
    this.#assertRedeemable(this.#find(this.#database.db, input));
    assertPasswordAllowed(account.username, account.password);
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
          email: account.email,
        },
        SELF_ACTOR,
        tx,
      );
      markRedeemed(tx, row.id, user.id, this.#now());
      this.#copyProgramItemsToMember(tx, row.id, user.id);
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
      markRedeemed(tx, row.id, userId, this.#now());
      this.#copyProgramItemsToMember(tx, row.id, userId);
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
}

/**
 * Marks the invitation redeemed. Only one transaction can flip `active` to `redeemed`: the
 * update matches only an active row, so a second one fails even if it got past every check
 * before (INV-08).
 */
export function markRedeemed(
  tx: Pick<Database["db"], "update">,
  id: number,
  userId: number,
  now: Date,
): void {
  const done = tx
    .update(invitations)
    .set({ status: "redeemed", redeemedAt: now, redeemedBy: userId })
    .where(and(eq(invitations.id, id), eq(invitations.status, "active")))
    .run();
  if (done.changes !== 1) {
    throw new InvitationError("invitation_redeemed", "this code is redeemed");
  }
}
