import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FEATURE_NAMES, SETTING_NAMES } from "@zappaloo/shared";
import type { EventConfig } from "@zappaloo/shared";
import { dataPaths, ensureDataDirs } from "../data-dir.ts";
import { openDatabase, runMigrations } from "../database/database.ts";
import type { Database } from "../database/database.ts";
import { tempDir } from "../test-support.ts";
import { bootstrapEvent, CLI_ACTOR, EventError, EventService } from "./service.ts";

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

const config = (changes: Partial<EventConfig> = {}): EventConfig => ({
  id: "my-event",
  name: "My Event",
  slug: "my-event",
  timezone: "Europe/Zurich",
  defaultLanguage: "de",
  theme: { config: "theme.json" },
  features: {
    minigames: true,
    snapshots: true,
    gallery: false,
    keepsakes: true,
    rsvp: true,
    treasureHunt: false,
    eventScreen: true,
  },
  settings: { platformOpen: false, snapshotUploadsOpen: false, keepsakeUploadsOpen: true },
  ...changes,
});

describe("event in the database", () => {
  it("[CFG-05] features and settings are initialised from event.json", () => {
    const database = migratedDatabase();
    bootstrapEvent(database, config());
    const event = EventService.forInstallation(database);
    expect(event.eventId).toBe("my-event");
    expect(event.get()).toEqual({
      id: "my-event",
      name: "My Event",
      slug: "my-event",
      timezone: "Europe/Zurich",
      defaultLanguage: "de",
      features: config().features,
      settings: config().settings,
    });
  });

  it("[CFG-05] the admin's changes survive restarts; the identity is refreshed, new keys are filled in", () => {
    const database = migratedDatabase();
    bootstrapEvent(database, config());
    const event = EventService.forInstallation(database);
    event.setFeature("gallery", true, CLI_ACTOR);
    event.setSetting("platformOpen", true, CLI_ACTOR);

    // The next start: event.json changed its name, and says other initial values.
    bootstrapEvent(
      database,
      config({
        name: "Renamed",
        timezone: "Europe/Berlin",
        features: { ...config().features, gallery: false, minigames: false },
        settings: { ...config().settings, platformOpen: false },
      }),
    );
    const after = event.get();
    expect(after.name).toBe("Renamed");
    expect(after.timezone).toBe("Europe/Berlin");
    expect(after.features.gallery).toBe(true); // changed at runtime: kept
    expect(after.features.minigames).toBe(true); // initial value only used once
    expect(after.settings.platformOpen).toBe(true);

    // A key that is missing in the database (a toggle added by a later version) is filled in.
    database.sqlite.prepare("DELETE FROM event_features WHERE name = 'treasureHunt'").run();
    bootstrapEvent(database, config({ features: { ...config().features, treasureHunt: true } }));
    expect(event.features().treasureHunt).toBe(true);
  });

  it("an installation serves exactly one event", () => {
    const database = migratedDatabase();
    expect(() => EventService.forInstallation(database)).toThrow(/no event yet/);
    bootstrapEvent(database, config());
    expect(() => {
      bootstrapEvent(database, config({ id: "other", slug: "other" }));
    }).toThrow(EventError);
    expect(() => {
      bootstrapEvent(database, config({ id: "other", slug: "other" }));
    }).toThrow(/belongs to the event "my-event"/);
  });

  it("[CFG-03][CFG-05] changes apply at once, in every service reading the database", () => {
    const database = migratedDatabase();
    bootstrapEvent(database, config());
    const server = EventService.forInstallation(database);
    const cli = EventService.forInstallation(database);
    expect(server.isFeatureEnabled("gallery")).toBe(false);
    expect(cli.setFeature("gallery", true, CLI_ACTOR)).toBe(true);
    expect(server.isFeatureEnabled("gallery")).toBe(true);
    expect(cli.setSetting("snapshotUploadsOpen", true, CLI_ACTOR)).toBe(true);
    expect(server.settings().snapshotUploadsOpen).toBe(true);
  });
});

describe("audit log", () => {
  it("[DATA-03] records who changed what and when, and nothing when nothing changed", () => {
    const database = migratedDatabase();
    bootstrapEvent(database, config());
    const times = [new Date("2026-11-10T10:00:00Z"), new Date("2026-11-10T10:05:00Z")];
    const event = EventService.forInstallation(database, () => times.shift() ?? new Date(0));

    expect(event.setFeature("gallery", true, "cli")).toBe(true);
    expect(event.setSetting("platformOpen", true, "user:7")).toBe(true);
    // Already on: no change, no entry.
    expect(event.setFeature("gallery", true, "cli")).toBe(false);

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
        { name: "gallery", from: false, to: true },
        "2026-11-10T10:00:00.000Z",
      ],
    ]);
    expect(entries.every((e) => e.eventId === "my-event")).toBe(true);
  });

  it("[DATA-03] a failed change leaves no audit entry and no change", () => {
    const database = migratedDatabase();
    bootstrapEvent(database, config());
    const event = EventService.forInstallation(database);
    database.sqlite.exec("DROP TABLE audit_log");
    expect(() => event.setFeature("gallery", true, "cli")).toThrow();
    expect(event.features().gallery).toBe(false);
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
      "audit_log",
      "event_features",
      "event_settings",
      "membership_roles",
      "memberships",
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
