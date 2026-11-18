// The seating plan and the table finder (sw-architecture.md 3.6; PRES-05 – PRES-07, PRES-12). The tables are the
// `table` values of the seat objects of the active world, each with as many places as seat objects; the seats have no
// position in the game. The admin places the persons who attend; a companion follows the guest's table until they are
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
  users,
} from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import { personKey } from "../profile/service.ts";
import type { ProfileService } from "../profile/service.ts";
import type { WorldService } from "../world/service.ts";

export class SeatingError extends Error {
  readonly code: "person_not_found" | "table_not_found" | "table_full";

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

/** The user as the table finder needs them. */
export interface SeatingUser {
  id: number;
}

export class SeatingService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #world: WorldService;
  readonly #profile: ProfileService;

  constructor(
    database: Database,
    event: EventService,
    world: WorldService,
    profile: ProfileService,
  ) {
    this.#database = database;
    this.#event = event;
    this.#world = world;
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

  #assignments(): Map<string, string> {
    return new Map(
      this.#database.db
        .select()
        .from(seatingAssignments)
        .where(eq(seatingAssignments.eventId, this.#event.eventId))
        .all()
        .map((row) => [row.personKey, row.tableName]),
    );
  }

  /** The table of everybody: the one the admin chose, or for a companion without one the guest's (PRES-07). */
  #effective(
    persons: readonly Person[],
    assignments: ReadonlyMap<string, string>,
    tables: ReadonlySet<string>,
  ): Map<string, string | undefined> {
    const own = (key: string): string | undefined => {
      const table = assignments.get(key);
      return table !== undefined && tables.has(table) ? table : undefined;
    };
    return new Map(
      persons.map((person) => [
        person.key,
        own(person.key) ?? (person.host === null ? undefined : own(person.host.key)),
      ]),
    );
  }

  /** The seating plan for the admin: the tables with their persons, and those without a table. */
  admin(): AdminSeatingResponse {
    const tables = this.#world.tables();
    const persons = this.#persons();
    const assignments = this.#assignments();
    const effective = this.#effective(
      persons,
      assignments,
      new Set(tables.map((table) => table.name)),
    );
    const view = (person: Person): SeatingPerson => ({
      key: person.key,
      name: person.name,
      companionOf: person.host?.name ?? null,
      placed:
        assignments.has(person.key) && effective.get(person.key) === assignments.get(person.key),
    });
    return {
      visibleFrom: this.visibleFrom()?.toISOString() ?? null,
      tables: tables.map((table) => ({
        name: table.name,
        map: table.map,
        mapName: table.mapName ?? null,
        places: table.places,
        persons: persons.filter((person) => effective.get(person.key) === table.name).map(view),
      })),
      unassigned: persons.filter((person) => effective.get(person.key) === undefined).map(view),
    };
  }

  /**
   * Places a person at a table, or takes the place away (`null`: a guest is unassigned, a companion follows their
   * guest again). A table takes as many persons as it has places, the companions who follow the guest included.
   */
  assign(key: string, table: string | null, actor: Actor): void {
    const tables = this.#world.tables();
    const persons = this.#persons();
    const person = persons.find((item) => item.key === key);
    if (person === undefined) throw new SeatingError("person_not_found", "there is no such person");
    const info = table === null ? undefined : tables.find((item) => item.name === table);
    if (table !== null && info === undefined) {
      throw new SeatingError("table_not_found", "the world has no such table");
    }
    const names = new Set(tables.map((item) => item.name));
    const next = this.#assignments();
    if (table === null) next.delete(key);
    else next.set(key, table);
    if (info !== undefined) {
      const effective = this.#effective(persons, next, names);
      const taken = [...effective.values()].filter((value) => value === info.name).length;
      if (taken > info.places) {
        throw new SeatingError("table_full", `the table has ${String(info.places)} places`);
      }
    }
    const eventId = this.#event.eventId;
    this.#database.db.transaction((tx) => {
      if (table === null) {
        tx.delete(seatingAssignments)
          .where(
            and(eq(seatingAssignments.eventId, eventId), eq(seatingAssignments.personKey, key)),
          )
          .run();
      } else {
        tx.insert(seatingAssignments)
          .values({ eventId, personKey: key, tableName: table })
          .onConflictDoUpdate({
            target: [seatingAssignments.eventId, seatingAssignments.personKey],
            set: { tableName: table },
          })
          .run();
      }
      this.#event.audit(actor, "seating.assign", { person: key, table }, tx);
    });
  }

  /** The table finder of a guest (PRES-06, PRES-12): their tables and the tablemates, once the plan is visible. */
  forGuest(user: SeatingUser, now = new Date()): SeatingGuestResponse {
    const from = this.visibleFrom();
    const visibleFrom = from?.toISOString() ?? null;
    if (from === null || from.getTime() > now.getTime()) {
      return { visible: false, visibleFrom, tables: [] };
    }
    const found = this.#tablesOfGuest(user);
    return { visible: true, visibleFrom, tables: found.tables };
  }

  /** The key of every person at the guest's tables (for the photos): themselves and all tablemates. */
  #tablesOfGuest(user: SeatingUser): { tables: SeatingGuestTable[]; keys: Set<string> } {
    const tables = this.#world.tables();
    const persons = this.#persons();
    const effective = this.#effective(
      persons,
      this.#assignments(),
      new Set(tables.map((t) => t.name)),
    );
    const cards = this.#profile.cards();
    const me = personKey(null, user.id);
    const party = persons.filter((person) => person.key === me || person.host?.key === me);
    const result: SeatingGuestTable[] = [];
    const keys = new Set<string>();
    for (const info of tables) {
      const own = party.filter((person) => effective.get(person.key) === info.name);
      if (own.length === 0) continue;
      const mates: SeatingMate[] = persons
        .filter((person) => effective.get(person.key) === info.name && person.key !== me)
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
        name: info.name,
        map: info.map,
        mapName: info.mapName ?? null,
        places: info.places,
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
