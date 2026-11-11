// RSVP: event parts, menu options, the deadline, the guests' answers and the admin overview
// (RSVP-01 – RSVP-07, SEC-11; sw-architecture.md 7.4, 7.4.1). Allergies are health data: only
// the admin overview and the guest's own answer ever return them (SEC-11).
import { and, asc, eq, inArray } from "drizzle-orm";
import { MAX_COMPANIONS } from "@zappaloo/shared";
import type {
  Companion,
  CompanionRequest,
  EventPart,
  EventPartRequest,
  EventPartUpdate,
  MenuOption,
  RsvpAnswer,
  RsvpAnswerRequest,
  RsvpCompanion,
  RsvpConfig,
  RsvpGuest,
  RsvpOverview,
  RsvpState,
  RsvpStatus,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import {
  companionAttendance,
  companions,
  eventParts,
  membershipParts,
  membershipRoles,
  menuOptions,
  rsvpAnswers,
  rsvpAttendance,
  rsvpConfig,
  users,
} from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import { closesAt } from "./deadline.ts";

export type RsvpErrorCode =
  | "part_not_found"
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
  attendance: { partId: number; attending: boolean }[];
  attending: number[];
  menuId: number | null;
  allergies: string | null;
}

type Tx = Parameters<Parameters<Database["db"]["transaction"]>[0]>[0];
type Reader = Pick<Database["db"], "select">;
type PartRow = typeof eventParts.$inferSelect;

const toPart = (row: PartRow): EventPart => ({
  id: row.id,
  name: row.name,
  startsAt: row.startsAt.toISOString(),
  place: row.place,
  hasMeal: row.hasMeal,
});

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

  // --- Deadline, parts and menus (Einstellungen › Rückmeldung) -----------------------------

  #parts(reader: Reader = this.#database.db): EventPart[] {
    return reader
      .select()
      .from(eventParts)
      .where(eq(eventParts.eventId, this.#event.eventId))
      .orderBy(asc(eventParts.startsAt), asc(eventParts.id))
      .all()
      .map(toPart);
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

  config(): RsvpConfig {
    return {
      deadline: this.#deadline(),
      songEnabled: this.#songEnabled(),
      parts: this.#parts(),
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

  #part(tx: Reader, id: number): PartRow {
    const row = tx
      .select()
      .from(eventParts)
      .where(and(eq(eventParts.id, id), eq(eventParts.eventId, this.#event.eventId)))
      .get();
    if (!row) throw new RsvpError("part_not_found", "no such event part");
    return row;
  }

  /** At most one part has the meal: marking one clears the mark on another. */
  #clearMeal(tx: Tx): void {
    tx.update(eventParts)
      .set({ hasMeal: false })
      .where(and(eq(eventParts.eventId, this.#event.eventId), eq(eventParts.hasMeal, true)))
      .run();
  }

  createPart(input: EventPartRequest, actor: Actor): EventPart {
    return this.#database.db.transaction((tx) => {
      if (input.hasMeal) this.#clearMeal(tx);
      const row = tx
        .insert(eventParts)
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
      this.#event.audit(actor, "rsvp.part.create", { partId: row.id }, tx);
      return toPart(row);
    });
  }

  updatePart(id: number, changes: EventPartUpdate, actor: Actor): EventPart {
    return this.#database.db.transaction((tx) => {
      this.#part(tx, id);
      if (changes.hasMeal) this.#clearMeal(tx);
      const row = tx
        .update(eventParts)
        .set({
          ...(changes.name === undefined ? {} : { name: changes.name }),
          ...(changes.startsAt === undefined ? {} : { startsAt: new Date(changes.startsAt) }),
          ...(changes.place === undefined ? {} : { place: changes.place }),
          ...(changes.hasMeal === undefined ? {} : { hasMeal: changes.hasMeal }),
        })
        .where(eq(eventParts.id, id))
        .returning()
        .get();
      this.#event.audit(actor, "rsvp.part.update", { partId: id }, tx);
      return toPart(row);
    });
  }

  /** Deleting a part also removes the invitations' parts and the answers for it. */
  deletePart(id: number, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      this.#part(tx, id);
      tx.delete(eventParts).where(eq(eventParts.id, id)).run();
      this.#event.audit(actor, "rsvp.part.delete", { partId: id }, tx);
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

  // --- Invited parts ------------------------------------------------------------------------

  /** The ids of every part of the event. */
  allPartIds(reader: Reader = this.#database.db): number[] {
    return this.#parts(reader).map((part) => part.id);
  }

  invitedPartIds(userId: number, reader: Reader = this.#database.db): number[] {
    return reader
      .select({ partId: membershipParts.partId })
      .from(membershipParts)
      .where(
        and(eq(membershipParts.eventId, this.#event.eventId), eq(membershipParts.userId, userId)),
      )
      .all()
      .map((row) => row.partId)
      .sort((a, b) => a - b);
  }

  /**
   * Replaces the parts a `vip` is invited to (RSVP-02). Answers for parts that are no longer
   * invited are removed, so the guest table never shows an answer for a part without invitation.
   */
  setInvitedParts(userId: number, partIds: number[], actor: Actor): number[] {
    const wanted = [...new Set(partIds)].sort((a, b) => a - b);
    return this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      const known = new Set(this.allPartIds(tx));
      if (wanted.some((id) => !known.has(id))) {
        throw new RsvpError("part_not_found", "no such event part");
      }
      const eventId = this.#event.eventId;
      tx.delete(membershipParts)
        .where(and(eq(membershipParts.eventId, eventId), eq(membershipParts.userId, userId)))
        .run();
      for (const partId of wanted) {
        tx.insert(membershipParts).values({ eventId, userId, partId }).run();
      }
      const dropped = this.#attendance(tx, userId).filter((a) => !wanted.includes(a.partId));
      for (const { partId } of dropped) {
        tx.delete(rsvpAttendance)
          .where(
            and(
              eq(rsvpAttendance.eventId, eventId),
              eq(rsvpAttendance.userId, userId),
              eq(rsvpAttendance.partId, partId),
            ),
          )
          .run();
      }
      // The guest's companions are invited to the same parts.
      const mine = this.#companionRows(tx, userId).map((c) => c.id);
      if (mine.length > 0) {
        for (const partId of this.allPartIds(tx).filter((id) => !wanted.includes(id))) {
          tx.delete(companionAttendance)
            .where(
              and(
                inArray(companionAttendance.companionId, mine),
                eq(companionAttendance.partId, partId),
              ),
            )
            .run();
        }
      }
      this.#event.audit(actor, "user.parts", { userId, partIds: wanted }, tx);
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

  #attendance(reader: Reader, userId: number): { partId: number; attending: boolean }[] {
    return reader
      .select({ partId: rsvpAttendance.partId, attending: rsvpAttendance.attending })
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
    return {
      attendingPartIds: this.#attendance(reader, userId)
        .filter((a) => a.attending)
        .map((a) => a.partId)
        .sort((a, b) => a - b),
      menuId: row.menuId,
      allergies: row.allergies,
      songWish: row.songWish,
      answeredAt: row.answeredAt.toISOString(),
    };
  }

  /** What the wizard shows: the guest's invited parts, the menus, the deadline and the answer. */
  state(userId: number): RsvpState {
    const { db } = this.#database;
    const guest = this.#guest(db, userId);
    const invited = new Set(this.invitedPartIds(userId));
    return {
      name: guest.displayName,
      deadline: this.#deadline(),
      closed: this.isClosed(),
      songEnabled: this.#songEnabled(),
      parts: this.#parts().filter((part) => invited.has(part.id)),
      menus: this.#menus(),
      answer: this.#answer(db, userId),
      companions: this.#companionsOf(db, userId),
    };
  }

  // --- Accompanying persons (RSVP-08 – RSVP-10) ---------------------------------------------

  /**
   * Checks the answer of one person against the invited parts and the meal rules, the same for
   * a guest and for a companion: yes or no for every invited part, a menu for a person who
   * attends the meal part while menus exist, allergies only for someone who attends.
   */
  #checkPerson(
    tx: Reader,
    invited: number[],
    input: {
      attendance: { partId: number; attending: boolean }[];
      menuId?: number | null | undefined;
      allergies?: string | null | undefined;
    },
  ): CheckedPerson {
    const given = input.attendance.map((a) => a.partId);
    if (
      new Set(given).size !== given.length ||
      given.length !== invited.length ||
      given.some((id) => !invited.includes(id))
    ) {
      throw new RsvpError(
        "invalid_attendance",
        "answer yes or no for every part you are invited to, once each",
      );
    }
    const attending = input.attendance.filter((a) => a.attending).map((a) => a.partId);
    const mealPart = this.#parts(tx).find((part) => part.hasMeal);
    const menus = this.#menus(tx);
    const attendsMeal = mealPart !== undefined && attending.includes(mealPart.id);
    let menuId: number | null = null;
    if (attendsMeal && menus.length > 0) {
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
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note,
      status: row.status,
      attendingPartIds: attendance
        .filter((a) => a.companionId === row.id && a.attending)
        .map((a) => a.partId)
        .sort((x, y) => x - y),
      menuId: row.menuId,
      allergies: row.allergies,
    }));
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
    for (const { partId, attending } of person.attendance) {
      tx.insert(companionAttendance).values({ eventId, companionId, partId, attending }).run();
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
      const person = this.#checkPerson(tx, this.invitedPartIds(userId, tx), input);
      const row = tx
        .insert(companions)
        .values({
          eventId: this.#event.eventId,
          hostUserId: userId,
          name: input.name,
          note: input.note ?? null,
          createdAt: this.#now(),
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
      const person = this.#checkPerson(tx, this.invitedPartIds(userId, tx), input);
      tx.update(companions)
        .set({ name: input.name, note: input.note ?? null })
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
      if (row.status === "approved") {
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

  /** The name of an approved person is changed by the admin only (7.4.1). */
  renameCompanion(id: number, name: string, actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const row = tx
        .select()
        .from(companions)
        .where(and(eq(companions.id, id), eq(companions.eventId, this.#event.eventId)))
        .get();
      if (!row) throw new RsvpError("companion_not_found", "no such accompanying person");
      tx.update(companions).set({ name }).where(eq(companions.id, id)).run();
      this.#event.audit(actor, "companion.rename", { companionId: id }, tx);
    });
  }

  /**
   * Saves the answer of a guest (RSVP-01, RSVP-03, RSVP-06): yes or no for every invited part;
   * a menu choice for a person who attends the meal part while menus exist; allergies and, while
   * the admin has switched it on, a song wish optionally. A guest who declines every part keeps no menu, allergies or song wish.
   * After the deadline only an admin can change it (`admin`, RSVP-04).
   */
  answer(userId: number, input: RsvpAnswerRequest, actor: Actor, admin = false): RsvpState {
    this.#database.db.transaction((tx) => {
      this.#guest(tx, userId);
      if (!admin && this.isClosed()) {
        throw new RsvpError("rsvp_closed", "the deadline for the RSVP has passed");
      }
      const invited = this.invitedPartIds(userId, tx);
      const person = this.#checkPerson(tx, invited, input);
      const { menuId } = person;
      const anyAttending = person.attending.length > 0;
      const eventId = this.#event.eventId;
      tx.delete(rsvpAttendance)
        .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.userId, userId)))
        .run();
      for (const { partId, attending: yes } of input.attendance) {
        tx.insert(rsvpAttendance).values({ eventId, userId, partId, attending: yes }).run();
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
          this.#checkPerson(tx, invited, companionAnswer),
        );
      }
      // Ids only: the allergies are health data and stay out of the log (SEC-04, SEC-11).
      this.#event.audit(actor, admin ? "rsvp.admin_answer" : "rsvp.answer", { userId }, tx);
    });
    return this.state(userId);
  }

  // --- Overview for the admin ---------------------------------------------------------------

  #guests(): RsvpGuest[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const rows = db
      .select({
        id: users.id,
        displayName: users.displayName,
        emailStatus: users.emailStatus,
        email: users.email,
      })
      .from(users)
      .innerJoin(membershipRoles, eq(membershipRoles.userId, users.id))
      .where(and(eq(membershipRoles.eventId, eventId), eq(membershipRoles.role, "vip")))
      .orderBy(asc(users.displayName), asc(users.id))
      .all();
    const ids = rows.map((row) => row.id);
    const invited = ids.length
      ? db.select().from(membershipParts).where(inArray(membershipParts.userId, ids)).all()
      : [];
    const attendance = ids.length
      ? db.select().from(rsvpAttendance).where(inArray(rsvpAttendance.userId, ids)).all()
      : [];
    const answers = ids.length
      ? db.select().from(rsvpAnswers).where(inArray(rsvpAnswers.userId, ids)).all()
      : [];
    return rows.map((row) => {
      const answer = answers.find((a) => a.userId === row.id);
      const attendingPartIds = attendance
        .filter((a) => a.userId === row.id && a.attending)
        .map((a) => a.partId)
        .sort((a, b) => a - b);
      const status: RsvpStatus = !answer
        ? "none"
        : attendingPartIds.length > 0
          ? "attending"
          : "declined";
      return {
        userId: row.id,
        name: row.displayName,
        status,
        invitedPartIds: invited
          .filter((p) => p.userId === row.id)
          .map((p) => p.partId)
          .sort((a, b) => a - b),
        attendingPartIds,
        menuId: answer?.menuId ?? null,
        songWish: answer?.songWish ?? null,
        allergies: answer?.allergies ?? null,
        verifiedEmail: row.emailStatus === "verified" && row.email !== null,
      };
    });
  }

  /** Totals per part and menu, and the guest table (RSVP-05). Admin only: it holds allergies. */
  overview(): RsvpOverview {
    const config = this.config();
    const guests = this.#guests();
    const answered = guests.filter((g) => g.status !== "none");
    const rows = this.#companionRows(this.#database.db);
    const attendance = rows.length
      ? this.#database.db.select().from(companionAttendance).all()
      : [];
    const names = new Map(guests.map((g) => [g.userId, g.name]));
    const everyone: RsvpCompanion[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      note: row.note,
      status: row.status,
      attendingPartIds: attendance
        .filter((a) => a.companionId === row.id && a.attending)
        .map((a) => a.partId)
        .sort((x, y) => x - y),
      menuId: row.menuId,
      allergies: row.allergies,
      hostUserId: row.hostUserId,
      hostName: names.get(row.hostUserId) ?? "",
    }));
    // Approved companions count like guests; they are invited to their guest's parts.
    const approved = everyone
      .filter((c) => c.status === "approved")
      .flatMap((c) => {
        const host = guests.find((g) => g.userId === c.hostUserId);
        return host ? [{ ...c, invitedPartIds: host.invitedPartIds }] : [];
      });
    const totals = config.parts.map((part) => ({
      partId: part.id,
      yes:
        answered.filter((g) => g.attendingPartIds.includes(part.id)).length +
        approved.filter((c) => c.attendingPartIds.includes(part.id)).length,
      no:
        answered.filter(
          (g) => g.invitedPartIds.includes(part.id) && !g.attendingPartIds.includes(part.id),
        ).length +
        approved.filter(
          (c) => c.invitedPartIds.includes(part.id) && !c.attendingPartIds.includes(part.id),
        ).length,
    }));
    const meal = config.parts.find((part) => part.hasMeal);
    const counts = new Map<number | null, number>();
    if (meal) {
      for (const person of [...guests, ...approved].filter((p) =>
        p.attendingPartIds.includes(meal.id),
      )) {
        counts.set(person.menuId, (counts.get(person.menuId) ?? 0) + 1);
      }
    }
    return {
      ...config,
      totals,
      menuTotals: [...counts].map(([menuId, count]) => ({ menuId, count })),
      guests,
      companions: everyone,
      pendingCount: everyone.filter((c) => c.status === "pending").length,
      answered: answered.length,
      total: guests.length,
      reminderCount: this.reminderRecipients().length,
    };
  }

  /** Guests without an answer who have a verified address (RSVP-07). */
  reminderRecipients(): { userId: number; name: string; email: string }[] {
    const { db } = this.#database;
    const pending = this.#guests().filter((g) => g.status === "none" && g.verifiedEmail);
    if (pending.length === 0) return [];
    const rows = db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        inArray(
          users.id,
          pending.map((g) => g.userId),
        ),
      )
      .all();
    return pending.flatMap((guest) => {
      const email = rows.find((row) => row.id === guest.userId)?.email;
      return email ? [{ userId: guest.userId, name: guest.name, email }] : [];
    });
  }

  /** The guest table as CSV for the hosts (RSVP-05); contains allergies, so admins only. */
  csv(): string {
    const overview = this.overview();
    const menuName = (id: number | null) =>
      id === null ? "" : (overview.menus.find((m) => m.id === id)?.name ?? "");
    const header = [
      "Name",
      "Status",
      ...overview.parts.map((part) => part.name),
      "Menü",
      ...(overview.songEnabled ? ["Songwunsch"] : []),
      "Allergien",
    ];
    const status = { attending: "zugesagt", declined: "abgesagt", none: "ohne Antwort" } as const;
    const lines = overview.guests.flatMap((guest) => [
      [
        guest.name,
        status[guest.status],
        ...overview.parts.map((part) =>
          !guest.invitedPartIds.includes(part.id)
            ? ""
            : guest.status === "none"
              ? ""
              : guest.attendingPartIds.includes(part.id)
                ? "ja"
                : "nein",
        ),
        menuName(guest.menuId),
        ...(overview.songEnabled ? [guest.songWish ?? ""] : []),
        guest.allergies ?? "",
      ],
      // Approved companions follow their guest, marked with an arrow.
      ...overview.companions
        .filter((c) => c.hostUserId === guest.userId && c.status === "approved")
        .map((c) => [
          `↳ ${c.name}`,
          "bestätigt",
          ...overview.parts.map((part) =>
            !guest.invitedPartIds.includes(part.id)
              ? ""
              : c.attendingPartIds.includes(part.id)
                ? "ja"
                : "nein",
          ),
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
  const parts: [string, string, string, boolean][] = [
    ["Trauung", "2027-06-12T12:00:00.000Z", "Kirche Muri", false],
    ["Apéro", "2027-06-12T13:30:00.000Z", "Schlossgarten", false],
    ["Dinner", "2027-06-12T16:30:00.000Z", "Landgasthof Linde", true],
    ["Party", "2027-06-12T20:00:00.000Z", "Linde, Saal", false],
  ];
  for (const [name, startsAt, place, hasMeal] of parts) {
    rsvp.createPart({ name, startsAt, place, hasMeal }, actor);
  }
  for (const name of ["Fleisch", "Vegetarisch", "Vegan", "Kindermenü"])
    rsvp.createMenu(name, actor);
  rsvp.setDeadline("2027-05-01", actor);
}
