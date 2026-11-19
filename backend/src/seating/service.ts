// The seating plan and the table finder (sw-architecture.md 3.6; PRES-05 – PRES-07, PRES-12). The admin makes the
// tables (a name and the number of places) and places the persons who attend on them; where at a table somebody sits
// is not part of Zappaloo, and the game world has no seats. A companion follows the guest's table until they are
// placed elsewhere. Guests see their table and their tablemates from the date the admin sets.
import { and, eq, inArray } from "drizzle-orm";
import type {
  AdminSeatingResponse,
  SeatingGuestResponse,
  SeatingGuestTable,
  SeatingMate,
  SeatingPerson,
} from "@zappaloo/shared";
import {
  companionAttendance,
  companions,
  rsvpAttendance,
  seatingAssignments,
  seatingConfig,
  seatingTables,
  users,
} from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import { personKey } from "../profile/service.ts";
import type { ProfileService } from "../profile/service.ts";

export class SeatingError extends Error {
  readonly code: "person_not_found" | "table_not_found" | "table_full" | "table_duplicate";

  constructor(code: SeatingError["code"], message: string) {
    super(message);
    this.name = "SeatingError";
    this.code = code;
  }
}

/** A person who attends: the guest, or an approved companion with the guest who brought them. */
interface Person {
  key: string;
  name: string;
  /** The key and the name of the guest of a companion. */
  host: { key: string; name: string } | null;
}

interface Table {
  id: number;
  name: string;
  places: number;
}

/** The user as the table finder needs them. */
export interface SeatingUser {
  id: number;
}

export class SeatingService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #profile: ProfileService;

  constructor(database: Database, event: EventService, profile: ProfileService) {
    this.#database = database;
    this.#event = event;
    this.#profile = profile;
  }

  /** When guests see the plan, or null while it is hidden. */
  visibleFrom(): Date | null {
    return (
      this.#database.db
        .select({ at: seatingConfig.visibleFrom })
        .from(seatingConfig)
        .where(eq(seatingConfig.eventId, this.#event.eventId))
        .get()?.at ?? null
    );
  }

  setVisibleFrom(at: Date | null, actor: Actor): void {
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      tx.insert(seatingConfig)
        .values({ eventId, visibleFrom: at })
        .onConflictDoUpdate({ target: seatingConfig.eventId, set: { visibleFrom: at } })
        .run();
      this.#event.audit(
        actor,
        "seating.visibility",
        { visibleFrom: at?.toISOString() ?? null },
        tx,
      );
    });
  }

  /** The tables in the order of their names (numbers by value: 2 before 10). */
  #tables(): Table[] {
    return this.#database.db
      .select({ id: seatingTables.id, name: seatingTables.name, places: seatingTables.places })
      .from(seatingTables)
      .where(eq(seatingTables.eventId, this.#event.eventId))
      .all()
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  /** Makes a table (PRES-05); two tables cannot have the same name, whatever the case. */
  createTable(name: string, places: number, actor: Actor): number {
    const eventId = this.#event.eventId;
    return this.#database.db.transaction((tx) => {
      const key = name.toLocaleLowerCase();
      const taken = tx
        .select({ id: seatingTables.id })
        .from(seatingTables)
        .where(and(eq(seatingTables.eventId, eventId), eq(seatingTables.nameKey, key)))
        .get();
      if (taken !== undefined) {
        throw new SeatingError("table_duplicate", "there is a table with this name already");
      }
      const row = tx
        .insert(seatingTables)
        .values({ eventId, name, nameKey: key, places, createdAt: new Date() })
        .returning({ id: seatingTables.id })
        .get();
      this.#event.audit(actor, "seating.table.create", { table: row.id, places }, tx);
      return row.id;
    });
  }

  /** Renames a table and changes its places; fewer places than persons at it are refused. */
  updateTable(id: number, name: string, places: number, actor: Actor): void {
    const eventId = this.#event.eventId;
    const tables = this.#tables();
    if (!tables.some((table) => table.id === id)) {
      throw new SeatingError("table_not_found", "there is no such table");
    }
    const key = name.toLocaleLowerCase();
    const other = tables.find((table) => table.id !== id && table.name.toLocaleLowerCase() === key);
    if (other !== undefined) {
      throw new SeatingError("table_duplicate", "there is a table with this name already");
    }
    const taken = this.#taken(id);
    if (places < taken) {
      throw new SeatingError("table_full", `${String(taken)} persons sit at this table`);
    }
    this.#database.db.transaction((tx) => {
      tx.update(seatingTables)
        .set({ name, nameKey: key, places })
        .where(and(eq(seatingTables.eventId, eventId), eq(seatingTables.id, id)))
        .run();
      this.#event.audit(actor, "seating.table.update", { table: id, places }, tx);
    });
  }

  /** Deletes a table; its persons have no table afterwards (a companion follows the guest again). */
  deleteTable(id: number, actor: Actor): void {
    const eventId = this.#event.eventId;
    if (!this.#tables().some((table) => table.id === id)) {
      throw new SeatingError("table_not_found", "there is no such table");
    }
    this.#database.db.transaction((tx) => {
      tx.delete(seatingTables)
        .where(and(eq(seatingTables.eventId, eventId), eq(seatingTables.id, id)))
        .run();
      this.#event.audit(actor, "seating.table.delete", { table: id }, tx);
    });
  }

  /** How many persons sit at a table now, the companions who follow their guest included. */
  #taken(id: number): number {
    const persons = this.#persons();
    const effective = this.#effective(persons, this.#assignments());
    return [...effective.values()].filter((value) => value === id).length;
  }

  /** Everyone who attends (RSVP yes for at least one program item): active guests and their approved companions. */
  #persons(): Person[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const userIds = [
      ...new Set(
        db
          .select({ id: rsvpAttendance.userId })
          .from(rsvpAttendance)
          .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.attending, true)))
          .all()
          .map((row) => row.id),
      ),
    ];
    const guests =
      userIds.length === 0
        ? []
        : db
            .select({ id: users.id, name: users.displayName })
            .from(users)
            .where(and(inArray(users.id, userIds), eq(users.status, "active")))
            .all();
    const attendingCompanions = [
      ...new Set(
        db
          .select({ id: companionAttendance.companionId })
          .from(companionAttendance)
          .where(
            and(eq(companionAttendance.eventId, eventId), eq(companionAttendance.attending, true)),
          )
          .all()
          .map((row) => row.id),
      ),
    ];
    const names = new Map(guests.map((guest) => [guest.id, guest.name]));
    const result: Person[] = guests.map((guest) => ({
      key: personKey(null, guest.id),
      name: guest.name,
      host: null,
    }));
    if (attendingCompanions.length > 0) {
      const rows = db
        .select()
        .from(companions)
        .where(
          and(
            eq(companions.eventId, eventId),
            eq(companions.status, "approved"),
            inArray(companions.id, attendingCompanions),
          ),
        )
        .all();
      for (const row of rows) {
        const hostName =
          names.get(row.hostUserId) ??
          db
            .select({ name: users.displayName })
            .from(users)
            .where(eq(users.id, row.hostUserId))
            .get()?.name ??
          "";
        result.push({
          key: personKey(row.id, row.hostUserId),
          name: row.name,
          host: { key: personKey(null, row.hostUserId), name: hostName },
        });
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The table id the admin chose, by person key. */
  #assignments(): Map<string, number> {
    return new Map(
      this.#database.db
        .select()
        .from(seatingAssignments)
        .where(eq(seatingAssignments.eventId, this.#event.eventId))
        .all()
        .map((row) => [row.personKey, row.tableId]),
    );
  }

  /** The table of everybody: the one the admin chose, or for a companion without one the guest's (PRES-07). */
  #effective(
    persons: readonly Person[],
    assignments: ReadonlyMap<string, number>,
  ): Map<string, number | undefined> {
    return new Map(
      persons.map((person) => [
        person.key,
        assignments.get(person.key) ??
          (person.host === null ? undefined : assignments.get(person.host.key)),
      ]),
    );
  }

  /** The seating plan for the admin: the tables with their persons, and those without a table. */
  admin(): AdminSeatingResponse {
    const tables = this.#tables();
    const persons = this.#persons();
    const assignments = this.#assignments();
    const effective = this.#effective(persons, assignments);
    const view = (person: Person): SeatingPerson => ({
      key: person.key,
      name: person.name,
      companionOf: person.host?.name ?? null,
      placed: assignments.has(person.key),
    });
    return {
      visibleFrom: this.visibleFrom()?.toISOString() ?? null,
      tables: tables.map((table) => ({
        id: table.id,
        name: table.name,
        places: table.places,
        persons: persons.filter((person) => effective.get(person.key) === table.id).map(view),
      })),
      unassigned: persons.filter((person) => effective.get(person.key) === undefined).map(view),
    };
  }

  /**
   * Places a person at a table, or takes the place away (`null`: a guest is unassigned, a companion follows their
   * guest again). A table takes as many persons as it has places, the companions who follow the guest included.
   */
  assign(key: string, tableId: number | null, actor: Actor): void {
    const tables = this.#tables();
    const persons = this.#persons();
    if (!persons.some((item) => item.key === key)) {
      throw new SeatingError("person_not_found", "there is no such person");
    }
    const table = tableId === null ? undefined : tables.find((item) => item.id === tableId);
    if (tableId !== null && table === undefined) {
      throw new SeatingError("table_not_found", "there is no such table");
    }
    const next = this.#assignments();
    if (tableId === null) next.delete(key);
    else next.set(key, tableId);
    if (table !== undefined) {
      const taken = [...this.#effective(persons, next).values()].filter(
        (value) => value === table.id,
      ).length;
      if (taken > table.places) {
        throw new SeatingError("table_full", `the table has ${String(table.places)} places`);
      }
    }
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      if (tableId === null) {
        tx.delete(seatingAssignments)
          .where(
            and(eq(seatingAssignments.eventId, eventId), eq(seatingAssignments.personKey, key)),
          )
          .run();
      } else {
        tx.insert(seatingAssignments)
          .values({ eventId, personKey: key, tableId })
          .onConflictDoUpdate({
            target: [seatingAssignments.eventId, seatingAssignments.personKey],
            set: { tableId },
          })
          .run();
      }
      this.#event.audit(actor, "seating.assign", { person: key, table: tableId }, tx);
    });
  }

  /** The table finder of a guest (PRES-06, PRES-12): their tables and the tablemates, once the plan is visible. */
  forGuest(user: SeatingUser, now = new Date()): SeatingGuestResponse {
    const from = this.visibleFrom();
    const visibleFrom = from?.toISOString() ?? null;
    if (from === null || from.getTime() > now.getTime()) {
      return { visible: false, visibleFrom, tables: [] };
    }
    return { visible: true, visibleFrom, tables: this.#tablesOfGuest(user).tables };
  }

  /** The guest's tables with their tablemates, and the key of every tablemate (for the photos). */
  #tablesOfGuest(user: SeatingUser): { tables: SeatingGuestTable[]; keys: Set<string> } {
    const persons = this.#persons();
    const effective = this.#effective(persons, this.#assignments());
    const cards = this.#profile.cards();
    const me = personKey(null, user.id);
    const party = persons.filter((person) => person.key === me || person.host?.key === me);
    const result: SeatingGuestTable[] = [];
    const keys = new Set<string>();
    for (const table of this.#tables()) {
      const own = party.filter((person) => effective.get(person.key) === table.id);
      if (own.length === 0) continue;
      const mates: SeatingMate[] = persons
        .filter((person) => effective.get(person.key) === table.id && person.key !== me)
        .map((person) => {
          const card = cards.get(person.key);
          keys.add(person.key);
          return {
            key: person.key,
            name: person.name,
            companionOf: person.host?.name ?? null,
            greeting: card?.greeting ?? null,
            badge: card?.badge ?? null,
            line: card?.line ?? null,
            photo: card?.photo ?? null,
          };
        });
      result.push({
        name: table.name,
        places: table.places,
        party: own.map((person) => person.name),
        mates,
      });
    }
    return { tables: result, keys };
  }

  /** The photo of a tablemate of the guest (never of anyone else), once the plan is visible. */
  photoOf(
    user: SeatingUser,
    key: string,
    now = new Date(),
  ): { bytes: Buffer; mime: string } | undefined {
    const from = this.visibleFrom();
    if (from === null || from.getTime() > now.getTime()) return undefined;
    return this.#tablesOfGuest(user).keys.has(key) ? this.#profile.photoByKey(key) : undefined;
  }
}
