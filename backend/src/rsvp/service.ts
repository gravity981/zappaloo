// RSVP: program items, menu options, the deadline, the guests' answers and the admin overview
// (RSVP-01 – RSVP-07, SEC-11; sw-architecture.md 7.4, 7.4.1). Allergies are health data: only
// the admin overview and the guest's own answer ever return them (SEC-11).
import { and, asc, eq, inArray } from "drizzle-orm";
import { MAX_COMPANIONS, menuRequired, rsvpStatus } from "@zappaloo/shared";
import type {
  PersonType,
  Companion,
  CompanionRequest,
  ProgramItem,
  ProgramItemRequest,
  ProgramItemUpdate,
  MenuOption,
  RsvpAnswer,
  RsvpAnswerRequest,
  RsvpCompanion,
  RsvpConfig,
  RsvpGuest,
  RsvpOverview,
  RsvpState,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  companionAttendance,
  companions,
  programItems,
  membershipProgramItems,
  membershipRoles,
  memberships,
  menuOptions,
  rsvpAnswers,
  rsvpAttendance,
  rsvpConfig,
  users,
} from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { Mailer } from "../mail/mailer.ts";
import { rsvpReminderMail } from "../mail/templates.ts";
import { attendingNow, pruneAnswers } from "./cleanup.ts";
import { closesAt } from "./deadline.ts";

export type RsvpErrorCode =
  | "program_item_not_found"
  | "menu_not_found"
  | "user_not_found"
  | "not_a_guest"
  | "rsvp_closed"
  | "invalid_attendance"
  | "menu_required"
  | "invalid_menu"
  | "companion_not_found"
  | "companion_not_editable"
  | "companion_decided"
  | "companion_limit";

export class RsvpError extends Error {
  override name = "RsvpError";
  readonly code: RsvpErrorCode;
  constructor(code: RsvpErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

/** One person's answer after the checks of `#checkPerson`. */
interface CheckedPerson {
  attendance: { programItemId: number; attending: boolean }[];
  attending: number[];
  menuId: number | null;
  allergies: string | null;
}

type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
type Reader = Pick<Database["db"], "select">;
type ProgramItemRow = typeof programItems.$inferSelect;

const toProgramItem = (row: ProgramItemRow): ProgramItem => ({
  id: row.id,
  name: row.name,
  startsAt: row.startsAt.toISOString(),
  place: row.place,
  hasMeal: row.hasMeal,
});

/** The program items answered with yes (or with no), sorted. */
function programItemIdsOf(
  rows: { programItemId: number; attending: boolean }[],
  attending: boolean,
): number[] {
  return rows
    .filter((row) => row.attending === attending)
    .map((row) => row.programItemId)
    .sort((a, b) => a - b);
}

type CompanionRow = typeof companions.$inferSelect;

function toCompanion(
  row: CompanionRow,
  attendance: { companionId: number; programItemId: number; attending: boolean }[],
): Companion {
  const mine = attendance.filter((a) => a.companionId === row.id);
  return {
    id: row.id,
    name: row.name,
    note: row.note,
    status: row.status,
    personType: row.personType,
    attendingItemIds: programItemIdsOf(mine, true),
    declinedItemIds: programItemIdsOf(mine, false),
    menuId: row.menuId,
    allergies: row.allergies,
  };
}

/** The guest table row as the admin gets it: the address is only for the reminder mails. */
function withoutEmail(guest: RsvpGuest & { email: string | null }): RsvpGuest {
  const row: Partial<typeof guest> = { ...guest };
  delete row.email;
  return row as RsvpGuest;
}

/** A reminder reaches a guest without an answer who has a verified address (RSVP-07). */
const isReminded = (guest: RsvpGuest): boolean => guest.status === "none" && guest.verifiedEmail;

/** One cell per program item of the CSV export: ja, nein, or empty when not invited or not answered. */
function programItemCell(
  person: { attendingItemIds: number[]; declinedItemIds: number[] },
  programItemId: number,
): string {
  if (person.attendingItemIds.includes(programItemId)) return "ja";
  return person.declinedItemIds.includes(programItemId) ? "nein" : "";
}

/** The labels of the person types in the CSV export (RSVP-15). */
const PERSON_TYPE_LABELS: Record<PersonType, string> = {
  adult: "Erwachsene",
  child: "Kind",
  baby: "Baby",
};

/** A cell of the CSV export; a leading `=`, `+`, `-` or `@` would be run as a formula. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r;]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export class RsvpService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #now: () => Date;

  constructor(database: Database, event: EventService, now: () => Date = () => new Date()) {
    this.#database = database;
    this.#event = event;
    this.#now = now;
  }

  // --- Deadline, program items and menus (Einstellungen › Rückmeldung) -----------------------------

  #programItems(reader: Reader = this.#database.db): ProgramItem[] {
    return reader
      .select()
      .from(programItems)
      .where(eq(programItems.eventId, this.#event.eventId))
      .orderBy(asc(programItems.startsAt), asc(programItems.id))
      .all()
      .map(toProgramItem);
  }

  #menus(reader: Reader = this.#database.db): MenuOption[] {
    return reader
      .select({ id: menuOptions.id, name: menuOptions.name })
      .from(menuOptions)
      .where(eq(menuOptions.eventId, this.#event.eventId))
      .orderBy(asc(menuOptions.id))
      .all();
  }

  #songEnabled(reader: Reader = this.#database.db): boolean {
    return (
      reader
        .select({ songEnabled: rsvpConfig.songEnabled })
        .from(rsvpConfig)
        .where(eq(rsvpConfig.eventId, this.#event.eventId))
        .get()?.songEnabled ?? true
    );
  }

  #deadline(reader: Reader = this.#database.db): string | null {
    return (
      reader
        .select({ deadline: rsvpConfig.deadline })
        .from(rsvpConfig)
        .where(eq(rsvpConfig.eventId, this.#event.eventId))
        .get()?.deadline ?? null
    );
  }

  /** Yes or no per program item (RSVP-11); off: one answer per person (the default). */
  perItem(reader: Reader = this.#database.db): boolean {
    return (
      reader
        .select({ perItem: rsvpConfig.perItem })
        .from(rsvpConfig)
        .where(eq(rsvpConfig.eventId, this.#event.eventId))
        .get()?.perItem ?? false
    );
  }

  /** Whether an added accompanying person waits for the admin's approval (RSVP-12). */
  companionApproval(reader: Reader = this.#database.db): boolean {
    return (
      reader
        .select({ companionApproval: rsvpConfig.companionApproval })
        .from(rsvpConfig)
        .where(eq(rsvpConfig.eventId, this.#event.eventId))
        .get()?.companionApproval ?? false
    );
  }

  /** Switches between one answer per person and yes or no per program item (RSVP-11). */
  setPerItem(enabled: boolean, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      if (this.perItem(tx) === enabled) return;
      tx.insert(rsvpConfig)
        .values({ eventId: this.#event.eventId, perItem: enabled })
        .onConflictDoUpdate({ target: rsvpConfig.eventId, set: { perItem: enabled } })
        .run();
      this.#event.audit(actor, "rsvp.per_item", { to: enabled }, tx);
    });
  }

  /**
   * Switches the approval of accompanying persons (RSVP-12). Switching it off approves every
   * request that waits for a decision; rejected ones stay rejected.
   */
  setCompanionApproval(enabled: boolean, actor: Actor): { approved: number } {
    return this.#database.db.transaction((tx) => {
      if (this.companionApproval(tx) === enabled) return { approved: 0 };
      tx.insert(rsvpConfig)
        .values({ eventId: this.#event.eventId, companionApproval: enabled })
        .onConflictDoUpdate({ target: rsvpConfig.eventId, set: { companionApproval: enabled } })
        .run();
      let approved = 0;
      if (!enabled) {
        const pending = tx
          .select({ id: companions.id })
          .from(companions)
          .where(and(eq(companions.eventId, this.#event.eventId), eq(companions.status, "pending")))
          .all();
        if (pending.length > 0) {
          tx.update(companions)
            .set({ status: "approved", decidedAt: this.#now() })
            .where(
              inArray(
                companions.id,
                pending.map((row) => row.id),
              ),
            )
            .run();
        }
        approved = pending.length;
      }
      this.#event.audit(actor, "rsvp.companion_approval", { to: enabled, approved }, tx);
      return { approved };
    });
  }

  config(): RsvpConfig {
    return {
      deadline: this.#deadline(),
      songEnabled: this.#songEnabled(),
      perItem: this.perItem(),
      companionApproval: this.companionApproval(),
      pendingCount: this.pendingCount(),
      programItems: this.#programItems(),
      menus: this.#menus(),
    };
  }

  /** True once the deadline day is over in the event's time zone (RSVP-04). */
  isClosed(): boolean {
    const deadline = this.#deadline();
    const { timezone } = this.#event.get();
    if (deadline === null || timezone === null) return false;
    return this.#now() >= closesAt(deadline, timezone);
  }

  setDeadline(deadline: string | null, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const before = this.#deadline(tx);
      if (before === deadline) return;
      tx.insert(rsvpConfig)
        .values({ eventId: this.#event.eventId, deadline })
        .onConflictDoUpdate({ target: rsvpConfig.eventId, set: { deadline } })
        .run();
      this.#event.audit(actor, "rsvp.deadline", { from: before, to: deadline }, tx);
    });
  }

  /** Switches the song wish on or off (RSVP-06); answers already given are kept. */
  setSongEnabled(enabled: boolean, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      if (this.#songEnabled(tx) === enabled) return;
      tx.insert(rsvpConfig)
        .values({ eventId: this.#event.eventId, songEnabled: enabled })
        .onConflictDoUpdate({ target: rsvpConfig.eventId, set: { songEnabled: enabled } })
        .run();
      this.#event.audit(actor, "rsvp.song", { to: enabled }, tx);
    });
  }

  #programItem(tx: Reader, id: number): ProgramItemRow {
    const row = tx
      .select()
      .from(programItems)
      .where(and(eq(programItems.id, id), eq(programItems.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new RsvpError("program_item_not_found", "no such program item");
    return row;
  }

  /** At most one program item has the meal: marking one clears the mark on another. */
  #clearMeal(tx: Tx): void {
    tx.update(programItems)
      .set({ hasMeal: false })
      .where(and(eq(programItems.eventId, this.#event.eventId), eq(programItems.hasMeal, true)))
      .run();
  }

  createProgramItem(input: ProgramItemRequest, actor: Actor): ProgramItem {
    return this.#database.db.transaction((tx) => {
      if (input.hasMeal) this.#clearMeal(tx);
      const row = tx
        .insert(programItems)
        .values({
          eventId: this.#event.eventId,
          name: input.name,
          startsAt: new Date(input.startsAt),
          place: input.place ?? null,
          hasMeal: input.hasMeal ?? false,
          createdAt: this.#now(),
        })
        .returning()
        .get();
      this.#event.audit(actor, "rsvp.program_item.create", { programItemId: row.id }, tx);
      return toProgramItem(row);
    });
  }

  updateProgramItem(id: number, changes: ProgramItemUpdate, actor: Actor): ProgramItem {
    return this.#database.db.transaction((tx) => {
      this.#programItem(tx, id);
      if (changes.hasMeal) this.#clearMeal(tx);
      const row = tx
        .update(programItems)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.startsAt === undefined ? {} : { startsAt: new Date(changes.startsAt) }),
          ...(changes.place === undefined ? {} : { place: changes.place }),
          ...(changes.hasMeal === undefined ? {} : { hasMeal: changes.hasMeal }),
        })
        .where(eq(programItems.id, id))
        .returning()
        .get();
      this.#event.audit(actor, "rsvp.program_item.update", { programItemId: id }, tx);
      return toProgramItem(row);
    });
  }

  /**
   * Deleting a program item also removes the invitations' program items and the answers for it; a guest or
   * companion whose only yes it was goes back to "no answer" (`pruneAnswers`).
   */
  deleteProgramItem(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#programItem(tx, id);
      const eventId = this.#event.eventId;
      const affected = tx
        .select({ userId: membershipProgramItems.userId })
        .from(membershipProgramItems)
        .where(
          and(
            eq(membershipProgramItems.eventId, eventId),
            eq(membershipProgramItems.programItemId, id),
          ),
        )
        .all()
        .map(({ userId }) => ({ userId, before: attendingNow(tx, eventId, userId) }));
      tx.delete(programItems).where(eq(programItems.id, id)).run();
      for (const { userId, before } of affected) pruneAnswers(tx, eventId, userId, before);
      this.#event.audit(actor, "rsvp.program_item.delete", { programItemId: id }, tx);
    });
  }

  createMenu(name: string, actor: Actor): MenuOption {
    return this.#database.db.transaction((tx) => {
      const row = tx
        .insert(menuOptions)
        .values({ eventId: this.#event.eventId, name, createdAt: this.#now() })
        .returning({ id: menuOptions.id, name: menuOptions.name })
        .get();
      this.#event.audit(actor, "rsvp.menu.create", { menuId: row.id }, tx);
      return row;
    });
  }

  #menu(tx: Reader, id: number): void {
    const row = tx
      .select({ id: menuOptions.id })
      .from(menuOptions)
      .where(and(eq(menuOptions.id, id), eq(menuOptions.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new RsvpError("menu_not_found", "no such menu option");
  }

  renameMenu(id: number, name: string, actor: Actor): MenuOption {
    return this.#database.db.transaction((tx) => {
      this.#menu(tx, id);
      const row = tx
        .update(menuOptions)
        .set({ name })
        .where(eq(menuOptions.id, id))
        .returning({ id: menuOptions.id, name: menuOptions.name })
        .get();
      this.#event.audit(actor, "rsvp.menu.update", { menuId: id }, tx);
      return row;
    });
  }

  /** Deleting a menu option leaves the guests who chose it without a menu choice. */
  deleteMenu(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#menu(tx, id);
      tx.delete(menuOptions).where(eq(menuOptions.id, id)).run();
      this.#event.audit(actor, "rsvp.menu.delete", { menuId: id }, tx);
    });
  }

  // --- Invited program items ------------------------------------------------------------------------

  /** The ids of every program item of the event. */
  allProgramItemIds(reader: Reader = this.#database.db): number[] {
    return this.#programItems(reader).map((programItem) => programItem.id);
  }

  invitedProgramItemIds(userId: number, reader: Reader = this.#database.db): number[] {
    return reader
      .select({ programItemId: membershipProgramItems.programItemId })
      .from(membershipProgramItems)
      .where(
        and(
          eq(membershipProgramItems.eventId, this.#event.eventId),
          eq(membershipProgramItems.userId, userId),
        ),
      )
      .all()
      .map((row) => row.programItemId)
      .sort((a, b) => a - b);
  }

  /**
   * Replaces the program items a `vip` is invited to (RSVP-02). Answers for program items that are no longer
   * invited are removed (`pruneAnswers`), so the guest table never shows an answer for a program item
   * without invitation; a program item added later is not answered yet.
   */
  setInvitedProgramItems(userId: number, programItemIds: number[], actor: Actor): number[] {
    const wanted = [...new Set(programItemIds)].sort((a, b) => a - b);
    return this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      const known = new Set(this.allProgramItemIds(tx));
      if (wanted.some((id) => !known.has(id))) {
        throw new RsvpError("program_item_not_found", "no such program item");
      }
      const eventId = this.#event.eventId;
      const before = attendingNow(tx, eventId, userId);
      tx.delete(membershipProgramItems)
        .where(
          and(
            eq(membershipProgramItems.eventId, eventId),
            eq(membershipProgramItems.userId, userId),
          ),
        )
        .run();
      for (const programItemId of wanted) {
        tx.insert(membershipProgramItems).values({ eventId, userId, programItemId }).run();
      }
      pruneAnswers(tx, eventId, userId, before);
      this.#event.audit(actor, "user.program_items", { userId, programItemIds: wanted }, tx);
      return wanted;
    });
  }

  // --- Answers ------------------------------------------------------------------------------

  /** The user must be a `vip` of the event: only guests answer. */
  #guest(tx: Reader, userId: number): { displayName: string } {
    const user = tx
      .select({ displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!user) throw new RsvpError("user_not_found", "no such user");
    const vip = tx
      .select({ role: membershipRoles.role })
      .from(membershipRoles)
      .where(
        and(
          eq(membershipRoles.eventId, this.#event.eventId),
          eq(membershipRoles.userId, userId),
          eq(membershipRoles.role, "vip"),
        ),
      )
      .get();
    if (!vip) throw new RsvpError("not_a_guest", "only guests answer the RSVP");
    return user;
  }

  #attendance(reader: Reader, userId: number): { programItemId: number; attending: boolean }[] {
    return reader
      .select({ programItemId: rsvpAttendance.programItemId, attending: rsvpAttendance.attending })
      .from(rsvpAttendance)
      .where(
        and(eq(rsvpAttendance.eventId, this.#event.eventId), eq(rsvpAttendance.userId, userId)),
      )
      .all();
  }

  #answer(reader: Reader, userId: number): RsvpAnswer | null {
    const row = reader
      .select()
      .from(rsvpAnswers)
      .where(and(eq(rsvpAnswers.eventId, this.#event.eventId), eq(rsvpAnswers.userId, userId)))
      .get();
    if (!row) return null;
    const attendance = this.#attendance(reader, userId);
    return {
      attendingItemIds: programItemIdsOf(attendance, true),
      declinedItemIds: programItemIdsOf(attendance, false),
      menuId: row.menuId,
      allergies: row.allergies,
      songWish: row.songWish,
      answeredAt: row.answeredAt.toISOString(),
    };
  }

  /** The person type of a guest (RSVP-13). */
  #personTypeOf(reader: Reader, userId: number): PersonType {
    return (
      reader
        .select({ personType: memberships.personType })
        .from(memberships)
        .where(and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, userId)))
        .get()?.personType ?? "adult"
    );
  }

  /** What the wizard shows: the guest's invited program items, the menus, the deadline and the answer. */
  state(userId: number): RsvpState {
    const { db } = this.#database;
    const guest = this.#guest(db, userId);
    const invited = new Set(this.invitedProgramItemIds(userId));
    return {
      name: guest.displayName,
      deadline: this.#deadline(),
      closed: this.isClosed(),
      songEnabled: this.#songEnabled(),
      personType: this.#personTypeOf(db, userId),
      perItem: this.perItem(),
      companionApproval: this.companionApproval(),
      programItems: this.#programItems().filter((programItem) => invited.has(programItem.id)),
      menus: this.#menus(),
      answer: this.#answer(db, userId),
      companions: this.#companionsOf(db, userId),
    };
  }

  // --- Accompanying persons (RSVP-08 – RSVP-10) ---------------------------------------------

  /**
   * Checks the answer of one person against the invited program items and the meal rules, the same for
   * a guest and for a companion: yes or no for every invited program item, a menu for a person who
   * attends the meal program item while menus exist, allergies only for someone who attends.
   */
  #checkPerson(
    tx: Reader,
    invited: number[],
    personType: PersonType,
    input: {
      attendance: { programItemId: number; attending: boolean }[];
      menuId?: number | null | undefined;
      allergies?: string | null | undefined;
    },
  ): CheckedPerson {
    const given = input.attendance.map((a) => a.programItemId);
    if (
      new Set(given).size !== given.length ||
      given.length !== invited.length ||
      given.some((id) => !invited.includes(id))
    ) {
      throw new RsvpError(
        "invalid_attendance",
        "answer yes or no for every program item you are invited to, once each",
      );
    }
    // One answer per person (RSVP-11): the same yes or no for every invited program item.
    if (!this.perItem(tx) && new Set(input.attendance.map((a) => a.attending)).size > 1) {
      throw new RsvpError(
        "invalid_attendance",
        "answer once for all program items: the same yes or no for each",
      );
    }
    const attending = input.attendance.filter((a) => a.attending).map((a) => a.programItemId);
    const menus = this.#menus(tx);
    let menuId: number | null = null;
    if (menuRequired(this.#programItems(tx), menus.length, attending, personType)) {
      if (input.menuId === undefined || input.menuId === null) {
        throw new RsvpError("menu_required", "choose a menu");
      }
      if (!menus.some((menu) => menu.id === input.menuId)) {
        throw new RsvpError("invalid_menu", "no such menu option");
      }
      menuId = input.menuId;
    }
    return {
      attendance: input.attendance,
      attending,
      menuId,
      allergies: attending.length > 0 ? (input.allergies ?? null) : null,
    };
  }

  #companionRows(reader: Reader, hostUserId?: number) {
    return reader
      .select()
      .from(companions)
      .where(
        hostUserId === undefined
          ? eq(companions.eventId, this.#event.eventId)
          : and(eq(companions.eventId, this.#event.eventId), eq(companions.hostUserId, hostUserId)),
      )
      .orderBy(asc(companions.id))
      .all();
  }

  #companionsOf(reader: Reader, hostUserId: number): Companion[] {
    const rows = this.#companionRows(reader, hostUserId);
    const attendance = rows.length
      ? reader
          .select()
          .from(companionAttendance)
          .where(
            inArray(
              companionAttendance.companionId,
              rows.map((row) => row.id),
            ),
          )
          .all()
      : [];
    return rows.map((row) => toCompanion(row, attendance));
  }

  /** A companion of this guest; a stranger's id is "not found". */
  #companion(tx: Reader, id: number, hostUserId: number) {
    const row = tx
      .select()
      .from(companions)
      .where(
        and(
          eq(companions.id, id),
          eq(companions.hostUserId, hostUserId),
          eq(companions.eventId, this.#event.eventId),
        ),
      )
      .get();
    if (!row) throw new RsvpError("companion_not_found", "no such accompanying person");
    return row;
  }

  #saveCompanionAnswer(tx: Tx, companionId: number, person: CheckedPerson): void {
    const eventId = this.#event.eventId;
    tx.delete(companionAttendance).where(eq(companionAttendance.companionId, companionId)).run();
    for (const { programItemId, attending } of person.attendance) {
      tx.insert(companionAttendance)
        .values({ eventId, companionId, programItemId, attending })
        .run();
    }
    tx.update(companions)
      .set({ menuId: person.menuId, allergies: person.allergies })
      .where(eq(companions.id, companionId))
      .run();
  }

  /** Guests change companions only until the deadline; admins always (RSVP-04). */
  #assertOpen(admin: boolean): void {
    if (!admin && this.isClosed()) {
      throw new RsvpError("rsvp_closed", "the deadline for the RSVP has passed");
    }
  }

  /**
   * A guest asks to bring a person without an account (RSVP-08): name, optional note and the
   * person's RSVP. At most ten (pending and approved) per guest.
   */
  requestCompanion(userId: number, input: CompanionRequest, actor: Actor): RsvpState {
    this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      this.#assertOpen(false);
      const open = this.#companionRows(tx, userId).filter((c) => c.status !== "rejected");
      if (open.length >= MAX_COMPANIONS) {
        throw new RsvpError(
          "companion_limit",
          `at most ${String(MAX_COMPANIONS)} accompanying persons per guest`,
        );
      }
      const person = this.#checkPerson(
        tx,
        this.invitedProgramItemIds(userId, tx),
        input.personType,
        input,
      );
      const row = tx
        .insert(companions)
        .values({
          eventId: this.#event.eventId,
          hostUserId: userId,
          name: input.name,
          personType: input.personType,
          note: input.note ?? null,
          createdAt: this.#now(),
          // Without approval (the default, RSVP-12) an added person counts right away.
          ...(this.companionApproval(tx)
            ? {}
            : { status: "approved" as const, decidedAt: this.#now() }),
        })
        .returning({ id: companions.id })
        .get();
      this.#saveCompanionAnswer(tx, row.id, person);
      this.#event.audit(actor, "companion.request", { companionId: row.id }, tx);
    });
    return this.state(userId);
  }

  /** While a request is pending, the guest changes name, note and the person's answer (RSVP-10). */
  updateCompanion(userId: number, id: number, input: CompanionRequest, actor: Actor): RsvpState {
    this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      this.#assertOpen(false);
      const row = this.#companion(tx, id, userId);
      if (row.status !== "pending") {
        throw new RsvpError(
          "companion_not_editable",
          "only a pending request can be changed; change the answer of an approved person in the RSVP",
        );
      }
      const person = this.#checkPerson(
        tx,
        this.invitedProgramItemIds(userId, tx),
        input.personType,
        input,
      );
      tx.update(companions)
        .set({ name: input.name, note: input.note ?? null, personType: input.personType })
        .where(eq(companions.id, id))
        .run();
      this.#saveCompanionAnswer(tx, id, person);
      this.#event.audit(actor, "companion.request", { companionId: id }, tx);
    });
    return this.state(userId);
  }

  /** A pending request is withdrawn, a rejected one removed; an approved person stays (7.4.1). */
  withdrawCompanion(userId: number, id: number, actor: Actor): RsvpState {
    this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      this.#assertOpen(false);
      const row = this.#companion(tx, id, userId);
      // With approval on, an approved person is removed by the hosts only (RSVP-10, RSVP-12).
      if (row.status === "approved" && this.companionApproval(tx)) {
        throw new RsvpError(
          "companion_not_editable",
          "an approved person is changed or removed by the hosts",
        );
      }
      tx.delete(companions).where(eq(companions.id, id)).run();
      this.#event.audit(actor, "companion.withdraw", { companionId: id }, tx);
    });
    return this.state(userId);
  }

  /** The admin approves or rejects a pending request (RSVP-09), also after the deadline. */
  decideCompanion(id: number, decision: "approved" | "rejected", actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const row = tx
        .select()
        .from(companions)
        .where(and(eq(companions.id, id), eq(companions.eventId, this.#event.eventId)))
        .get();
      if (!row) throw new RsvpError("companion_not_found", "no such accompanying person");
      if (row.status !== "pending") {
        throw new RsvpError("companion_decided", "this request has been decided already");
      }
      tx.update(companions)
        .set({ status: decision, decidedAt: this.#now() })
        .where(eq(companions.id, id))
        .run();
      this.#event.audit(
        actor,
        decision === "approved" ? "companion.approve" : "companion.reject",
        { companionId: id },
        tx,
      );
    });
  }

  /** The admin removes an accompanying person at any time, also after the deadline (RSVP-12). */
  removeCompanion(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const row = tx
        .select({ id: companions.id })
        .from(companions)
        .where(and(eq(companions.id, id), eq(companions.eventId, this.#event.eventId)))
        .get();
      if (!row) throw new RsvpError("companion_not_found", "no such accompanying person");
      // The attendance goes by cascade; the card "Zuletzt" can no longer name the person.
      this.#event.audit(actor, "companion.remove", { companionId: id }, tx);
      tx.delete(companions).where(eq(companions.id, id)).run();
    });
  }

  /** The name and the type of an accompanying person are changed by the admin only (7.4.1, RSVP-13). */
  renameCompanion(
    id: number,
    patch: { name?: string | undefined; personType?: PersonType | undefined },
    actor: Actor,
  ): void {
    this.#database.db.transaction((tx) => {
      const row = tx
        .select()
        .from(companions)
        .where(and(eq(companions.id, id), eq(companions.eventId, this.#event.eventId)))
        .get();
      if (!row) throw new RsvpError("companion_not_found", "no such accompanying person");
      tx.update(companions)
        .set({
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.personType === undefined ? {} : { personType: patch.personType }),
          // A baby is not asked for a menu: a chosen one goes (RSVP-14).
          ...(patch.personType === "baby" ? { menuId: null } : {}),
        })
        .where(eq(companions.id, id))
        .run();
      this.#event.audit(
        actor,
        "companion.rename",
        {
          companionId: id,
          ...(patch.personType === undefined ? {} : { personType: patch.personType }),
        },
        tx,
      );
    });
  }

  /**
   * Saves the answer of a guest (RSVP-01, RSVP-03, RSVP-06): yes or no for every invited program item;
   * a menu choice for a person who attends the meal program item while menus exist; allergies and, while
   * the admin has switched it on, a song wish optionally. A guest who declines every program item keeps no menu, allergies or song wish.
   * After the deadline only an admin can change it (`admin`, RSVP-04).
   */
  answer(userId: number, input: RsvpAnswerRequest, actor: Actor, admin = false): RsvpState {
    this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      if (!admin && this.isClosed()) {
        throw new RsvpError("rsvp_closed", "the deadline for the RSVP has passed");
      }
      const invited = this.invitedProgramItemIds(userId, tx);
      const person = this.#checkPerson(tx, invited, this.#personTypeOf(tx, userId), input);
      const { menuId } = person;
      const anyAttending = person.attending.length > 0;
      const eventId = this.#event.eventId;
      tx.delete(rsvpAttendance)
        .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, userId)))
        .run();
      for (const { programItemId, attending: yes } of input.attendance) {
        tx.insert(rsvpAttendance).values({ eventId, userId, programItemId, attending: yes }).run();
      }
      const values = {
        menuId,
        allergies: anyAttending ? (input.allergies ?? null) : null,
        // While the song wish is off, nothing is asked and an earlier wish stays as it is.
        ...(this.#songEnabled(tx)
          ? { songWish: anyAttending ? (input.songWish ?? null) : null }
          : {}),
        answeredAt: this.#now(),
      };
      tx.insert(rsvpAnswers)
        .values({ eventId, userId, ...values })
        .onConflictDoUpdate({ target: [rsvpAnswers.eventId, rsvpAnswers.userId], set: values })
        .run();
      for (const companionAnswer of input.companions ?? []) {
        const companion = this.#companion(tx, companionAnswer.companionId, userId);
        if (companion.status === "rejected") {
          throw new RsvpError("companion_not_editable", "a rejected request cannot be changed");
        }
        this.#saveCompanionAnswer(
          tx,
          companion.id,
          this.#checkPerson(tx, invited, companion.personType, companionAnswer),
        );
      }
      // Ids only: the allergies are health data and stay out of the log (SEC-04, SEC-11).
      this.#event.audit(actor, admin ? "rsvp.admin_answer" : "rsvp.answer", { userId }, tx);
    });
    return this.state(userId);
  }

  // --- Overview for the admin ---------------------------------------------------------------

  /** Every guest (`vip`) of the event with their answer; the email stays inside the service. */
  #guests(): (RsvpGuest & { email: string | null })[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const rows = db
      .select({
        id: users.id,
        displayName: users.displayName,
        emailStatus: users.emailStatus,
        email: users.email,
        personType: memberships.personType,
      })
      .from(users)
      .innerJoin(membershipRoles, eq(membershipRoles.userId, users.id))
      .innerJoin(
        memberships,
        and(eq(memberships.userId, users.id), eq(memberships.eventId, membershipRoles.eventId)),
      )
      .where(and(eq(membershipRoles.eventId, eventId), eq(membershipRoles.role, "vip")))
      .orderBy(asc(users.displayName), asc(users.id))
      .all();
    const ids = rows.map((row) => row.id);
    const invited = ids.length
      ? db
          .select()
          .from(membershipProgramItems)
          .where(
            and(
              eq(membershipProgramItems.eventId, eventId),
              inArray(membershipProgramItems.userId, ids),
            ),
          )
          .all()
      : [];
    const attendance = ids.length
      ? db
          .select()
          .from(rsvpAttendance)
          .where(and(eq(rsvpAttendance.eventId, eventId), inArray(rsvpAttendance.userId, ids)))
          .all()
      : [];
    const answers = ids.length
      ? db
          .select()
          .from(rsvpAnswers)
          .where(and(eq(rsvpAnswers.eventId, eventId), inArray(rsvpAnswers.userId, ids)))
          .all()
      : [];
    return rows.map((row) => {
      const answer = answers.find((a) => a.userId === row.id);
      const mine = attendance.filter((a) => a.userId === row.id);
      const invitedProgramItemIds = invited
        .filter((p) => p.userId === row.id)
        .map((p) => p.programItemId)
        .sort((a, b) => a - b);
      const attendingItemIds = programItemIdsOf(mine, true);
      const declinedItemIds = programItemIdsOf(mine, false);
      const verified = row.emailStatus === "verified" && row.email !== null;
      return {
        userId: row.id,
        name: row.displayName,
        personType: row.personType,
        status: rsvpStatus(
          answer !== undefined,
          invitedProgramItemIds,
          attendingItemIds,
          declinedItemIds,
        ),
        invitedProgramItemIds,
        attendingItemIds,
        declinedItemIds,
        menuId: answer?.menuId ?? null,
        songWish: answer?.songWish ?? null,
        allergies: answer?.allergies ?? null,
        verifiedEmail: verified,
        email: verified ? row.email : null,
      };
    });
  }

  /** Every companion of the event, with the name of the guest who asked. */
  #allCompanions(guests: RsvpGuest[]): RsvpCompanion[] {
    const { db } = this.#database;
    const rows = this.#companionRows(db);
    const attendance = rows.length
      ? db
          .select()
          .from(companionAttendance)
          .where(eq(companionAttendance.eventId, this.#event.eventId))
          .all()
      : [];
    const names = new Map(guests.map((g) => [g.userId, g.name]));
    return rows.map((row) => ({
      ...toCompanion(row, attendance),
      hostUserId: row.hostUserId,
      hostName: names.get(row.hostUserId) ?? "",
    }));
  }

  /** Totals per program item and menu, and the guest table (RSVP-05). Admin only: it holds allergies. */
  overview(): RsvpOverview {
    const config = this.config();
    const guests = this.#guests();
    const answered = guests.filter((g) => g.status !== "none");
    const everyone = this.#allCompanions(guests);
    // Approved companions count like guests; they are invited to their guest's program items.
    const approved = everyone
      .filter((c) => c.status === "approved")
      .flatMap((c) => {
        const host = guests.find((g) => g.userId === c.hostUserId);
        return host ? [c] : [];
      });
    const people = [...guests, ...approved];
    const totals = config.programItems.map((programItem) => ({
      programItemId: programItem.id,
      yes: people.filter((p) => p.attendingItemIds.includes(programItem.id)).length,
      no: people.filter((p) => p.declinedItemIds.includes(programItem.id)).length,
      yesByType: {
        adult: people.filter(
          (p) => p.personType === "adult" && p.attendingItemIds.includes(programItem.id),
        ).length,
        child: people.filter(
          (p) => p.personType === "child" && p.attendingItemIds.includes(programItem.id),
        ).length,
        baby: people.filter(
          (p) => p.personType === "baby" && p.attendingItemIds.includes(programItem.id),
        ).length,
      },
    }));
    const meal = config.programItems.find((programItem) => programItem.hasMeal);
    const counts = new Map<number | null, number>();
    if (meal) {
      // Babies get no menu, so they are not counted (RSVP-14).
      for (const person of people.filter(
        (p) => p.personType !== "baby" && p.attendingItemIds.includes(meal.id),
      )) {
        counts.set(person.menuId, (counts.get(person.menuId) ?? 0) + 1);
      }
    }
    return {
      ...config,
      totals,
      menuTotals: [...counts].map(([menuId, count]) => ({ menuId, count })),
      guests: guests.map(withoutEmail),
      companions: everyone,
      pendingCount: everyone.filter((c) => c.status === "pending").length,
      answered: answered.length,
      total: guests.length,
      reminderCount: guests.filter(isReminded).length,
    };
  }

  /** Requests waiting for a decision: the badge of the admin navigation (RSVP-09). */
  pendingCount(): number {
    return this.#database.db
      .select({ id: companions.id })
      .from(companions)
      .innerJoin(
        membershipRoles,
        and(
          eq(membershipRoles.eventId, companions.eventId),
          eq(membershipRoles.userId, companions.hostUserId),
          eq(membershipRoles.role, "vip"),
        ),
      )
      .where(and(eq(companions.eventId, this.#event.eventId), eq(companions.status, "pending")))
      .all().length;
  }

  /**
   * How many persons attend at least one program item: guests and approved companions (the waiting
   * page's `{waitingCount}`, ACS-11). Counts only, no answers leave the service.
   */
  acceptedCount(exceptUserId?: number): number {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const guests = new Set(
      db
        .select({ userId: rsvpAttendance.userId })
        .from(rsvpAttendance)
        .innerJoin(
          membershipRoles,
          and(
            eq(membershipRoles.eventId, rsvpAttendance.eventId),
            eq(membershipRoles.userId, rsvpAttendance.userId),
            eq(membershipRoles.role, "vip"),
          ),
        )
        .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.attending, true)))
        .all()
        .map((row) => row.userId)
        .filter((id) => id !== exceptUserId),
    );
    const persons = new Set(
      db
        .select({ id: companionAttendance.companionId })
        .from(companionAttendance)
        .innerJoin(companions, eq(companions.id, companionAttendance.companionId))
        .where(
          and(
            eq(companionAttendance.eventId, eventId),
            eq(companionAttendance.attending, true),
            eq(companions.status, "approved"),
          ),
        )
        .all()
        .map((row) => row.id),
    );
    return guests.size + persons.size;
  }

  /** Guests without an answer who have a verified address (RSVP-07). */
  reminderRecipients(): { userId: number; name: string; email: string }[] {
    return this.#guests().flatMap((guest) =>
      isReminded(guest) && guest.email !== null
        ? [{ userId: guest.userId, name: guest.name, email: guest.email }]
        : [],
    );
  }

  /**
   * Sends the reminder to every guest without an answer who has a verified address (RSVP-07).
   * A mail that fails does not stop the others; the answer says how many were sent.
   */
  async remind(
    mailer: Mailer,
    publicUrl: string,
    actor: Actor,
    log: (error: unknown) => void,
  ): Promise<{ sent: number }> {
    const eventName = this.#event.get().name ?? "Zappaloo";
    const deadline = this.#deadline();
    const url = `${publicUrl.replace(/\/+$/, "")}/rsvp`;
    let sent = 0;
    for (const recipient of this.reminderRecipients()) {
      try {
        await mailer.send(
          rsvpReminderMail(recipient.email, eventName, recipient.name, deadline, url),
        );
        sent += 1;
      } catch (error) {
        log(error);
      }
    }
    this.#event.audit(actor, "rsvp.remind", { sent });
    return { sent };
  }

  /** The guest table as CSV for the hosts (RSVP-05); contains allergies, so admins only. */
  csv(): string {
    const overview = this.overview();
    const menuName = (id: number | null) =>
      id === null ? "" : (overview.menus.find((m) => m.id === id)?.name ?? "");
    const header = [
      "Name",
      "Typ",
      "Status",
      ...overview.programItems.map((programItem) => programItem.name),
      "Menü",
      ...(overview.songEnabled ? ["Songwunsch"] : []),
      "Allergien",
    ];
    const status = { attending: "zugesagt", declined: "abgesagt", none: "ohne Antwort" } as const;
    const lines = overview.guests.flatMap((guest) => [
      [
        guest.name,
        PERSON_TYPE_LABELS[guest.personType],
        status[guest.status],
        ...overview.programItems.map((programItem) => programItemCell(guest, programItem.id)),
        menuName(guest.menuId),
        ...(overview.songEnabled ? [guest.songWish ?? ""] : []),
        guest.allergies ?? "",
      ],
      // Approved companions follow their guest, marked with an arrow.
      ...overview.companions
        .filter((c) => c.hostUserId === guest.userId && c.status === "approved")
        .map((c) => [
          `↳ ${c.name}`,
          PERSON_TYPE_LABELS[c.personType],
          "bestätigt",
          ...overview.programItems.map((programItem) => programItemCell(c, programItem.id)),
          menuName(c.menuId),
          ...(overview.songEnabled ? [""] : []),
          c.allergies ?? "",
        ]),
    ]);
    return [header, ...lines].map((row) => row.map(csvCell).join(";")).join("\r\n") + "\r\n";
  }
}

/** The example RSVP setup of dev and test (`zappaloo event seed-example`, CFG-07). */
export function seedExampleRsvp(rsvp: RsvpService, actor: Actor): void {
  const programItems: [string, string, string, boolean][] = [
    ["Trauung", "2027-06-12T12:00:00.000Z", "Kirche Muri", false],
    ["Apéro", "2027-06-12T13:30:00.000Z", "Schlossgarten", false],
    ["Dinner", "2027-06-12T16:30:00.000Z", "Landgasthof Linde", true],
    ["Party", "2027-06-12T20:00:00.000Z", "Linde, Saal", false],
  ];
  for (const [name, startsAt, place, hasMeal] of programItems) {
    rsvp.createProgramItem({ name, startsAt, place, hasMeal }, actor);
  }
  for (const name of ["Fleisch", "Vegetarisch", "Vegan", "Kindermenü"])
    rsvp.createMenu(name, actor);
  rsvp.setDeadline("2027-05-01", actor);
}
