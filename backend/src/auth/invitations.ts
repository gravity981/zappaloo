// Personal invitation codes (INV-01 – INV-12; sw-architecture.md 9). The code is a random
// 6-character string; only its SHA-256 is stored, so the plain code exists only in the
// response that creates or regenerates it (INV-02, INV-14).
import { randomBytes } from "node:crypto";
import { and, desc, eq, ne, notInArray, or } from "drizzle-orm";
import type { Invitation, InvitationStatus, PersonType, User } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  companions,
  guestGroupMembers,
  invitations,
  membershipProgramItems,
  membershipRoles,
  memberships,
  programItems,
  rsvpAnswers,
  rsvpAttendance,
  users,
} from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
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
  | "program_item_not_found";

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
type Reader = Pick<Database["db"], "select">;

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

  #toInvitation(
    row: Row,
    programItemIds: number[],
    removesGuest: boolean,
    personType: PersonType = "adult",
  ): Invitation {
    return {
      personType,
      id: row.id,
      guestName: row.guestName,
      note: row.note,
      status: this.#status(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      redeemedAt: row.redeemedAt?.toISOString() ?? null,
      redeemedBy: row.redeemedBy,
      programItemIds,
      userId: row.userId,
      removesGuest,
    };
  }

  /**
   * The program items of an invitation are those of the guest's account (7.1.2), so the
   * invitation row and the account panel edit the same list.
   */
  #programItemIds(tx: Reader, row: Row): number[] {
    if (row.userId === null) return [];
    return tx
      .select({ programItemId: membershipProgramItems.programItemId })
      .from(membershipProgramItems)
      .where(
        and(
          eq(membershipProgramItems.eventId, this.#event.eventId),
          eq(membershipProgramItems.userId, row.userId),
        ),
      )
      .all()
      .map((r) => r.programItemId)
      .sort((a, b) => a - b);
  }

  /**
   * Whether revoking this code removes the guest (INV-20): it is open (active or expired), the
   * account's last open code, and the account was never activated.
   */
  #removesGuest(tx: Reader, row: Row): boolean {
    if (row.status !== "active" || row.userId === null) return false;
    const account = tx
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, row.userId))
      .get();
    if (account?.status !== "inactive") return false;
    const others = tx
      .select({ id: invitations.id, status: invitations.status })
      .from(invitations)
      .where(and(eq(invitations.userId, row.userId), ne(invitations.id, row.id)))
      .all();
    // A code that was redeemed before means the account was activated once: it stays.
    return !others.some((other) => other.status === "active" || other.status === "redeemed");
  }

  /** The person type of the invitation's guest (RSVP-13), the account's. */
  #personType(tx: Reader, row: Row): PersonType {
    if (row.userId === null) return "adult";
    return (
      tx
        .select({ personType: memberships.personType })
        .from(memberships)
        .where(
          and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, row.userId)),
        )
        .get()?.personType ?? "adult"
    );
  }

  #view(tx: Reader, row: Row): Invitation {
    return this.#toInvitation(
      row,
      this.#programItemIds(tx, row),
      this.#removesGuest(tx, row),
      this.#personType(tx, row),
    );
  }

  list(): Invitation[] {
    const { db } = this.#database;
    return db
      .select()
      .from(invitations)
      .where(eq(invitations.eventId, this.#event.eventId))
      .orderBy(desc(invitations.id))
      .all()
      .map((row) => this.#view(db, row));
  }

  /** Every program item of the event must exist; undefined means all program items (RSVP-02). */
  #resolveProgramItems(tx: Reader, programItemIds: number[] | undefined): number[] {
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

  /**
   * One invitation per guest, all with the same optional expiry date (INV-01, INV-04). Each guest
   * gets an inactive account at once (ACC-17, 7.1.2), so they are on the guest list before the
   * card is redeemed.
   */
  create(
    guests: { name: string; note?: string | undefined }[],
    expiresAt: Date | undefined,
    actor: Actor,
    /** The program items the guests are invited to; undefined: all program items of the event. */
    programItemIds?: number[],
    /** The person type of the guests (RSVP-13); undefined: adult. */
    personType: PersonType = "adult",
  ): IssuedCode[] {
    return this.#database.db.transaction((tx) => {
      const programItems = this.#resolveProgramItems(tx, programItemIds);
      return guests.map((guest) => {
        const account = tx
          .insert(users)
          .values({
            displayName: guest.name,
            status: "inactive",
            createdAt: this.#now(),
            updatedAt: this.#now(),
          })
          .returning({ id: users.id })
          .get();
        const issued = this.#insert(tx, {
          guestName: guest.name,
          note: guest.note ?? null,
          expiresAt,
          userId: account.id,
        });
        const eventId = this.#event.eventId;
        tx.insert(memberships)
          .values({
            eventId,
            userId: account.id,
            createdAt: this.#now(),
            vipAssignment: "invitation_code",
            vipInvitationId: issued.invitation.id,
            personType,
          })
          .run();
        tx.insert(membershipRoles).values({ eventId, userId: account.id, role: "vip" }).run();
        for (const programItemId of programItems) {
          tx.insert(membershipProgramItems)
            .values({ eventId, userId: account.id, programItemId })
            .run();
        }
        const invitation = { ...issued.invitation, programItemIds: programItems, personType };
        // The id only: the guest's name is in the invitation, not copied into the log.
        this.#event.audit(actor, "invitation.create", { invitationId: invitation.id }, tx);
        return { ...issued, invitation };
      });
    });
  }

  /**
   * A code no invitation has had yet. With a few hundred codes among about a billion a
   * collision is rare, but it would fail the whole batch on the unique index; so draw again.
   */
  #unusedCode(tx: Reader): string {
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
    input: { guestName: string; note: string | null; expiresAt: Date | undefined; userId: number },
  ): IssuedCode {
    const code = this.#unusedCode(tx);
    const row = tx
      .insert(invitations)
      .values({
        eventId: this.#event.eventId,
        guestName: input.guestName,
        note: input.note,
        codeHash: hashToken(normalizeCode(code) ?? code),
        expiresAt: input.expiresAt ?? null,
        createdAt: this.#now(),
        userId: input.userId,
      })
      .returning()
      .get();
    return { invitation: this.#toInvitation(row, [], false), code };
  }

  #get(tx: Reader, id: number): Row {
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
   * redeemed (INV-10), and a revoked or replaced one is already dead (9.6.1). If it was the last
   * open code of an account that was never activated, the guest is removed with it (INV-20).
   */
  revoke(id: number, actor: Actor): Invitation & { guestRemoved: boolean } {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      const status = this.#status(row);
      if (status !== "active") {
        throw new InvitationError("not_revocable", `a ${status} code cannot be revoked`);
      }
      const removes = this.#removesGuest(tx, row);
      const programItemIds = this.#programItemIds(tx, row);
      const updated = tx
        .update(invitations)
        .set({ status: "revoked" })
        .where(and(eq(invitations.id, id), eq(invitations.status, "active")))
        .returning()
        .get();
      if (removes && row.userId !== null) {
        // The account with its invitations, answer entered by an admin and companions.
        this.#accounts.deleteUserRows(tx, row.userId);
      }
      this.#event.audit(
        actor,
        "invitation.revoke",
        { invitationId: id, ...(removes ? { guestRemoved: true } : {}) },
        tx,
      );
      return {
        ...this.#toInvitation(updated, programItemIds, false),
        userId: removes ? null : updated.userId,
        guestRemoved: removes,
      };
    });
  }

  /**
   * Replaces an active or expired code by a new one for the same guest; the old code becomes
   * `replaced` and no longer works (INV-05). The new code has the given expiry, or none.
   */
  regenerate(id: number, expiresAt: Date | undefined, actor: Actor): IssuedCode {
    return this.#database.db.transaction((tx) => {
      const row = this.#get(tx, id);
      if (row.status !== "active" || row.userId === null) {
        throw new InvitationError("not_regenerable", `a ${row.status} code cannot be regenerated`);
      }
      const issued = this.#insert(tx, {
        guestName: row.guestName,
        note: row.note,
        expiresAt,
        userId: row.userId,
      });
      tx.update(invitations)
        .set({ status: "replaced", replacedBy: issued.invitation.id })
        .where(eq(invitations.id, id))
        .run();
      // The account points to the code that is in use now.
      tx.update(memberships)
        .set({ vipInvitationId: issued.invitation.id })
        .where(
          and(
            eq(memberships.eventId, this.#event.eventId),
            eq(memberships.userId, row.userId),
            eq(memberships.vipInvitationId, id),
          ),
        )
        .run();
      this.#event.audit(
        actor,
        "invitation.regenerate",
        { invitationId: id, newInvitationId: issued.invitation.id },
        tx,
      );
      return {
        ...issued,
        invitation: {
          ...issued.invitation,
          programItemIds: this.#programItemIds(tx, row),
          personType: this.#personType(tx, row),
        },
      };
    });
  }

  /**
   * Deletes the revoked and replaced invitations (INV-21). Redeemed, active and expired ones stay.
   * Returns how many were deleted.
   */
  cleanup(actor: Actor): number {
    return this.#database.db.transaction((tx) => {
      const gone = tx
        .delete(invitations)
        .where(
          and(
            eq(invitations.eventId, this.#event.eventId),
            or(eq(invitations.status, "revoked"), eq(invitations.status, "replaced")),
          ),
        )
        .run().changes;
      this.#event.audit(actor, "invitation.cleanup", { count: gone }, tx);
      return gone;
    });
  }

  /** The invitation of a typed or scanned code, if it is a valid code at all. */
  #find(tx: Reader, input: string): Row {
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
   * A new guest registers and redeems the code in one step (INV-07): the inactive account of the
   * invitation gets its username, password and optional address and becomes active, and the
   * code is marked redeemed, in one transaction (INV-08).
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
      if (row.userId === null) {
        throw new InvitationError("invalid_invitation", "this code is not valid");
      }
      // Marking the code first: only one transaction can flip it (INV-08).
      markRedeemed(tx, row.id, row.userId, this.#now());
      const owner = tx
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, row.userId))
        .get();
      const user = this.#accounts.activateInvited(tx, row.userId, {
        username: account.username,
        displayName: account.displayName ?? owner?.displayName ?? row.guestName,
        passwordHash,
        email: account.email,
      });
      tx.update(memberships)
        .set({ vipAssignment: "invitation_code", vipInvitationId: row.id })
        .where(
          and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, row.userId)),
        )
        .run();
      this.#event.audit(
        `user:${String(user.id)}`,
        "invitation.redeem",
        { invitationId: row.id, userId: user.id, method: "register" },
        tx,
      );
      return { ...user, roles: ["vip"] };
    });
  }

  /**
   * A signed-in user without `vip` redeems the code and keeps their account (INV-07, ACC-07): the
   * invited person's inactive account is merged into it (7.1.2).
   */
  redeemForUser(input: string, userId: number): User {
    return this.#database.db.transaction((tx) => {
      const row = this.#find(tx, input);
      this.#assertRedeemable(row);
      if (row.userId === null) {
        throw new InvitationError("invalid_invitation", "this code is not valid");
      }
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
      const invited = row.userId;
      markRedeemed(tx, row.id, userId, this.#now());
      // The signed-in account becomes the guest ...
      tx.insert(membershipRoles).values({ eventId, userId, role: "vip" }).run();
      tx.update(memberships)
        .set({
          vipAssignment: "invitation_code",
          vipInvitationId: row.id,
          personType: this.#personType(tx, row),
        })
        .where(and(eq(memberships.eventId, eventId), eq(memberships.userId, userId)))
        .run();
      // ... and takes over what hangs on the invited person's account.
      tx.update(membershipProgramItems)
        .set({ userId })
        .where(
          and(
            eq(membershipProgramItems.eventId, eventId),
            eq(membershipProgramItems.userId, invited),
          ),
        )
        .run();
      tx.update(rsvpAnswers)
        .set({ userId })
        .where(and(eq(rsvpAnswers.eventId, eventId), eq(rsvpAnswers.userId, invited)))
        .run();
      tx.update(rsvpAttendance)
        .set({ userId })
        .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, invited)))
        .run();
      tx.update(companions)
        .set({ hostUserId: userId })
        .where(and(eq(companions.eventId, eventId), eq(companions.hostUserId, invited)))
        .run();
      // A group both accounts are in stays as it is: that membership of the invited account goes
      // with the account.
      const mine = tx
        .select({ groupId: guestGroupMembers.groupId })
        .from(guestGroupMembers)
        .where(and(eq(guestGroupMembers.eventId, eventId), eq(guestGroupMembers.userId, userId)))
        .all()
        .map((member) => member.groupId);
      tx.update(guestGroupMembers)
        .set({ userId })
        .where(
          and(
            eq(guestGroupMembers.eventId, eventId),
            eq(guestGroupMembers.userId, invited),
            ...(mine.length > 0 ? [notInArray(guestGroupMembers.groupId, mine)] : []),
          ),
        )
        .run();
      // The invitations of the invited account (replaced codes) move too, then it is deleted.
      tx.update(invitations).set({ userId }).where(eq(invitations.userId, invited)).run();
      tx.update(invitations)
        .set({ redeemedBy: userId })
        .where(eq(invitations.redeemedBy, invited))
        .run();
      tx.delete(users).where(eq(users.id, invited)).run();
      this.#event.audit(
        `user:${String(userId)}`,
        "invitation.redeem",
        { invitationId: row.id, userId, method: "merge", mergedUserId: invited },
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
