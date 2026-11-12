import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_FEATURES, DEFAULT_SETTINGS, FEATURE_NAMES, SETTING_NAMES } from "@zappaloo/shared";
import { dataPaths, ensureDataDirs } from "../data-dir.ts";
import { openDatabase, runMigrations } from "../database/database.ts";
import type { Database } from "../database/database.ts";
import { tempDir } from "../test-support.ts";
import { CLI_ACTOR, ensureEvent, EventError, EventService } from "./service.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function migratedDatabase(): Database {
  const dir = tempDir();
  const paths = dataPaths(join(dir.path, "data"));
  ensureDataDirs(paths);
  const database = openDatabase(paths.database);
  runMigrations(database);
  cleanups.push(() => {
    database.close();
    dir.remove();
  });
  return database;
}

const SETUP = { name: "My Event", timezone: "Europe/Zurich", defaultLanguage: "de" };

/** A started installation: the event exists, the admin has not set it up yet. */
function freshInstallation(): EventService {
  const database = migratedDatabase();
  ensureEvent(database);
  return EventService.forInstallation(database);
}

describe("event in the database", () => {
  it("[CFG-02] the first start creates the event without name, time zone and language, with the defaults", () => {
    const event = freshInstallation();
    expect(event.eventId).toBe("event1");
    expect(event.get()).toEqual({
      id: "event1",
      name: null,
      timezone: null,
      defaultLanguage: null,
      setupComplete: false,
      features: DEFAULT_FEATURES,
      settings: DEFAULT_SETTINGS,
    });
  });

  it("[CFG-02] the setup fills in name, time zone and language once and is audited", () => {
    const event = freshInstallation();
    const done = event.setup(SETUP, "user:1");
    expect(done).toMatchObject({ ...SETUP, setupComplete: true });
    expect(event.auditEntries().map((e) => [e.actor, e.action, e.details])).toEqual([
      ["user:1", "event.setup", SETUP],
    ]);
    expect(() => event.setup(SETUP, "user:1")).toThrow(/already set up/);
    expect(() => event.setup(SETUP, "user:1")).toThrow(EventError);
    expect(event.get().name).toBe("My Event");
  });

  it("[CFG-06] name, time zone and language stay editable; each change is audited, an unchanged value is not", () => {
    const event = freshInstallation();
    event.setup(SETUP, "user:1");
    const changed = event.update(
      { name: "Renamed", timezone: "Europe/Berlin", defaultLanguage: "de" },
      "user:2",
    );
    expect(changed).toMatchObject({ name: "Renamed", timezone: "Europe/Berlin" });
    expect(
      event
        .auditEntries()
        .filter((e) => e.action === "event.set")
        .map((e) => [e.actor, e.details]),
    ).toEqual([
      ["user:2", { name: "timezone", from: "Europe/Zurich", to: "Europe/Berlin" }],
      ["user:2", { name: "name", from: "My Event", to: "Renamed" }],
    ]);
  });

  it("[CFG-02] changes before the setup are refused", () => {
    const event = freshInstallation();
    expect(() => event.update({ settings: { snapshotUploadsOpen: true } }, "user:1")).toThrow(
      /not set up yet/,
    );
    expect(event.settings().snapshotUploadsOpen).toBe(false);
  });

  it("[CFG-05] the admin's changes survive restarts; a key missing in the database is filled in", () => {
    const database = migratedDatabase();
    ensureEvent(database);
    const event = EventService.forInstallation(database);
    event.setup(SETUP, CLI_ACTOR);
    event.setFeature("gallery", false, CLI_ACTOR);
    event.setSetting("platformOpen", true, CLI_ACTOR);

    // The next start: nothing is overwritten.
    ensureEvent(database);
    expect(event.get()).toMatchObject({ ...SETUP, setupComplete: true });
    expect(event.features().gallery).toBe(false);
    expect(event.settings().platformOpen).toBe(true);

    // A toggle added by a later version gets its default.
    database.sqlite.prepare("DELETE FROM event_features WHERE name = 'treasureHunt'").run();
    ensureEvent(database);
    expect(event.features().treasureHunt).toBe(true);
  });

  it("an installation serves exactly one event", () => {
    const database = migratedDatabase();
    expect(() => EventService.forInstallation(database)).toThrow(/no event yet/);
    ensureEvent(database);
    database.sqlite
      .prepare("INSERT INTO events (id, created_at, updated_at) VALUES ('other', 1, 1)")
      .run();
    expect(() => {
      ensureEvent(database);
    }).toThrow(EventError);
    expect(() => {
      ensureEvent(database);
    }).toThrow(/belongs to the event "other"/);
  });

  it("[CFG-03][CFG-05] changes apply at once, in every service reading the database", () => {
    const database = migratedDatabase();
    ensureEvent(database);
    const server = EventService.forInstallation(database);
    const cli = EventService.forInstallation(database);
    expect(server.isFeatureEnabled("gallery")).toBe(true);
    expect(cli.setFeature("gallery", false, CLI_ACTOR)).toBe(true);
    expect(server.isFeatureEnabled("gallery")).toBe(false);
    expect(cli.setSetting("snapshotUploadsOpen", true, CLI_ACTOR)).toBe(true);
    expect(server.settings().snapshotUploadsOpen).toBe(true);
  });
});

describe("audit log", () => {
  it("[DATA-03] records who changed what and when, and nothing when nothing changed", () => {
    const database = migratedDatabase();
    ensureEvent(database);
    const times = [new Date("2026-11-10T10:00:00Z"), new Date("2026-11-10T10:05:00Z")];
    const event = EventService.forInstallation(database, () => times.shift() ?? new Date(0));

    expect(event.setFeature("gallery", false, "cli")).toBe(true);
    expect(event.setSetting("platformOpen", true, "user:7")).toBe(true);
    // Already off: no change, no entry.
    expect(event.setFeature("gallery", false, "cli")).toBe(false);

    const entries = event.auditEntries();
    expect(entries.map((e) => [e.actor, e.action, e.details, e.createdAt.toISOString()])).toEqual([
      [
        "user:7",
        "setting.set",
        { name: "platformOpen", from: false, to: true },
        "2026-11-10T10:05:00.000Z",
      ],
      [
        "cli",
        "feature.set",
        { name: "gallery", from: true, to: false },
        "2026-11-10T10:00:00.000Z",
      ],
    ]);
    expect(entries.every((e) => e.eventId === "event1")).toBe(true);
  });

  it("[DATA-03] a failed change leaves no audit entry and no change", () => {
    const database = migratedDatabase();
    ensureEvent(database);
    const event = EventService.forInstallation(database);
    database.sqlite.exec("DROP TABLE audit_log");
    expect(() => event.setFeature("gallery", false, "cli")).toThrow();
    expect(event.features().gallery).toBe(true);
  });
});

describe("data model", () => {
  // Tables of a person, not of an event: accounts, their sessions and their one-time links.
  // A table that is not in this list must carry an eventId.
  const PERSON_TABLES = ["one_time_links", "sessions", "users"];

  it("[DATA-02] every event-related table carries a not-null eventId that references events", () => {
    const database = migratedDatabase();
    const all = (
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '\\_\\_drizzle%' ESCAPE '\\' AND name <> 'events'",
        )
        .all() as { name: string }[]
    ).map((t) => t.name);
    expect(all.filter((name) => PERSON_TABLES.includes(name)).sort()).toEqual(PERSON_TABLES);
    const tables = all.filter((name) => !PERSON_TABLES.includes(name)).map((name) => ({ name }));
    expect(tables.map((t) => t.name).sort()).toEqual([
      "access_releases",
      "audit_log",
      "companion_attendance",
      "companions",
      "event_features",
      "event_settings",
      "footer_notice",
      "guest_group_members",
      "guest_groups",
      "invitation_program_items",
      "invitations",
      "membership_capabilities",
      "membership_program_items",
      "membership_roles",
      "memberships",
      "menu_options",
      "privacy_notice",
      "program_items",
      "rsvp_answers",
      "rsvp_attendance",
      "rsvp_config",
      "waiting_config",
    ]);
    for (const { name } of tables) {
      const columns = database.sqlite.prepare(`PRAGMA table_info(${name})`).all() as {
        name: string;
        notnull: number;
      }[];
      const eventId = columns.find((c) => c.name === "event_id");
      expect(eventId?.notnull, `${name}.event_id`).toBe(1);
      const keys = database.sqlite.prepare(`PRAGMA foreign_key_list(${name})`).all() as {
        from: string;
        table: string;
      }[];
      expect(
        keys.some((k) => k.from === "event_id" && k.table === "events"),
        name,
      ).toBe(true);
    }
  });

  it("[DATA-02] roles, capabilities and group members belong to a membership of the group's own event", () => {
    const database = migratedDatabase();
    const { sqlite } = database;
    const now = Date.now();
    for (const id of ["one", "two"]) {
      sqlite
        .prepare(
          "INSERT INTO events (id, name, timezone, default_language, created_at, updated_at) VALUES (?, ?, 'UTC', 'de', ?, ?)",
        )
        .run(id, id, now, now);
    }
    sqlite
      .prepare(
        "INSERT INTO users (username, display_name, created_at, updated_at) VALUES ('anna', 'Anna', ?, ?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO guest_groups (event_id, name, name_key, created_at) VALUES ('two', 'G', 'g', ?)",
      )
      .run(now);
    const insertRole = () =>
      sqlite
        .prepare("INSERT INTO membership_roles (event_id, user_id, role) VALUES ('one', 1, 'vip')")
        .run();
    const insertMember = (eventId: string) =>
      sqlite
        .prepare("INSERT INTO guest_group_members (event_id, group_id, user_id) VALUES (?, 1, 1)")
        .run(eventId);

    // Without a membership: no role, no group membership.
    expect(insertRole).toThrow(/FOREIGN KEY/);
    sqlite
      .prepare("INSERT INTO memberships (event_id, user_id, created_at) VALUES ('one', 1, ?)")
      .run(now);
    insertRole();
    // The group belongs to event "two": a member row for event "one" is refused.
    expect(() => insertMember("one")).toThrow(/FOREIGN KEY/);

    // Removing the membership takes its roles along.
    sqlite.prepare("DELETE FROM memberships WHERE event_id = 'one' AND user_id = 1").run();
    expect(sqlite.prepare("SELECT * FROM membership_roles").all()).toEqual([]);
  });

  it("[CFG-03][CFG-05] knows exactly the features and settings of the spec", () => {
    expect([...FEATURE_NAMES]).toEqual([
      "minigames",
      "snapshots",
      "gallery",
      "keepsakes",
      "rsvp",
      "treasureHunt",
      "eventScreen",
    ]);
    expect([...SETTING_NAMES]).toEqual([
      "platformOpen",
      "snapshotUploadsOpen",
      "keepsakeUploadsOpen",
    ]);
  });
});
