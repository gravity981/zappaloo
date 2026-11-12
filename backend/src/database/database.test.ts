import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tempDir } from "../test-support.ts";
import { MigrationError, MIGRATIONS_DIR, openDatabase, runMigrations } from "./database.ts";
import type { Database } from "./database.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function freshDatabase(): { database: Database; dir: string } {
  const dir = tempDir();
  const database = openDatabase(join(dir.path, "test.db"));
  cleanups.push(() => {
    database.close();
    dir.remove();
  });
  return { database, dir: dir.path };
}

/**
 * Writes a migrations folder in drizzle-kit's format: meta/_journal.json and one
 * SQL file per migration, statements separated by `--> statement-breakpoint`.
 */
function writeMigrations(
  folder: string,
  migrations: { tag: string; statements: string[] }[],
): void {
  mkdirSync(join(folder, "meta"), { recursive: true });
  const entries = migrations.map((migration, idx) => ({
    idx,
    version: "6",
    when: 1_700_000_000_000 + idx * 1000,
    tag: migration.tag,
    breakpoints: true,
  }));
  writeFileSync(
    join(folder, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries }),
  );
  for (const migration of migrations) {
    writeFileSync(
      join(folder, `${migration.tag}.sql`),
      migration.statements.join("\n--> statement-breakpoint\n"),
    );
  }
}

const V1 = {
  tag: "0000_guests",
  statements: ["CREATE TABLE guests (id INTEGER PRIMARY KEY, name TEXT NOT NULL);"],
};
const V2 = {
  tag: "0001_rsvp",
  statements: [
    "ALTER TABLE guests ADD COLUMN attending INTEGER NOT NULL DEFAULT 0;",
    "CREATE TABLE notes (id INTEGER PRIMARY KEY, guest_id INTEGER NOT NULL REFERENCES guests(id), text TEXT NOT NULL);",
    "UPDATE guests SET attending = 1 WHERE name LIKE 'A%';",
  ],
};

describe("database migrations", () => {
  it("[DATA-04] the shipped migrations apply to an empty database, and only once", () => {
    const { database } = freshDatabase();
    runMigrations(database);
    expect(runMigrations(database)).toBe(0);
    const table = database.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE name = '__drizzle_migrations'")
      .get();
    expect(table).toBeDefined();
  });

  it("[DATA-04] a new migration version keeps the existing data", () => {
    const { database, dir } = freshDatabase();
    const folder = join(dir, "migrations");

    writeMigrations(folder, [V1]);
    expect(runMigrations(database, folder)).toBe(1);
    database.sqlite.exec("INSERT INTO guests (name) VALUES ('Anna'), ('Ben');");

    writeMigrations(folder, [V1, V2]);
    expect(runMigrations(database, folder)).toBe(1);
    expect(runMigrations(database, folder)).toBe(0);

    const guests = database.sqlite.prepare("SELECT name, attending FROM guests ORDER BY id").all();
    expect(guests).toEqual([
      { name: "Anna", attending: 1 },
      { name: "Ben", attending: 0 },
    ]);
  });

  it("[DATA-04] a failing migration applies nothing and reports the error", () => {
    const { database, dir } = freshDatabase();
    const folder = join(dir, "migrations");
    writeMigrations(folder, [V1]);
    runMigrations(database, folder);
    database.sqlite.exec("INSERT INTO guests (name) VALUES ('Anna');");

    writeMigrations(folder, [
      V1,
      { tag: "0001_broken", statements: [...V2.statements, "ALTER TABLE missing ADD COLUMN x;"] },
    ]);
    expect(() => runMigrations(database, folder)).toThrow(MigrationError);
    expect(() => runMigrations(database, folder)).toThrow(/no such table: missing/);

    // Rolled back: no new column, no new table, data unchanged, still on version 1.
    const columns = database.sqlite.prepare("PRAGMA table_info(guests)").all() as {
      name: string;
    }[];
    expect(columns.map((c) => c.name)).toEqual(["id", "name"]);
    expect(
      database.sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'notes'").get(),
    ).toBeUndefined();
    expect(database.sqlite.prepare("SELECT name FROM guests").all()).toEqual([{ name: "Anna" }]);
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM __drizzle_migrations").get()).toEqual(
      {
        n: 1,
      },
    );
  });
});

describe("concurrent processes", () => {
  it("[DATA-01] a transaction holds the write lock from its start, so another process waits instead of failing midway", () => {
    const { database, dir } = freshDatabase();
    database.sqlite.exec("CREATE TABLE t (n INTEGER)");
    // A second connection, like the CLI next to the server; it does not wait at all.
    const other = openDatabase(join(dir, "test.db"));
    cleanups.unshift(() => {
      other.close();
    });
    other.sqlite.pragma("busy_timeout = 0");

    database.db.transaction(() => {
      // Nothing written yet, but the lock is taken: the other connection cannot start writing.
      expect(() => other.sqlite.exec("BEGIN IMMEDIATE")).toThrow(/locked|busy/i);
    });
    // Afterwards it can.
    other.sqlite.exec("BEGIN IMMEDIATE; INSERT INTO t VALUES (1); COMMIT");
    expect(database.sqlite.prepare("SELECT count(*) AS n FROM t").get()).toEqual({ n: 1 });
  });
});

describe("migration 0008_program_items", () => {
  it("[DATA-04][RSVP-02] renames the tables and columns and keeps the data, answers and audit entries", () => {
    const { database, dir } = freshDatabase();
    // The database of the last release: everything before 0008.
    const folder = join(dir, "migrations");
    cpSync(MIGRATIONS_DIR, folder, { recursive: true });
    const journalFile = join(folder, "meta", "_journal.json");
    const journal = JSON.parse(readFileSync(journalFile, "utf8")) as {
      entries: { tag: string }[];
    };
    const all = journal.entries;
    const index = all.findIndex((entry) => entry.tag === "0008_program_items");
    expect(index).toBeGreaterThan(0);
    writeFileSync(journalFile, JSON.stringify({ ...journal, entries: all.slice(0, index) }));
    expect(runMigrations(database, folder)).toBe(index);

    database.sqlite.exec(`
      INSERT INTO events (id, created_at, updated_at) VALUES ('event1', 1, 1);
      INSERT INTO users (id, username, display_name, created_at, updated_at) VALUES (1, 'anna', 'Anna', 1, 1);
      INSERT INTO memberships (event_id, user_id, created_at) VALUES ('event1', 1, 1);
      INSERT INTO event_parts (id, event_id, name, starts_at, has_meal, created_at) VALUES (1, 'event1', 'Dinner', 1, 1, 1), (2, 'event1', 'Party', 2, 0, 1);
      INSERT INTO membership_parts (event_id, user_id, part_id) VALUES ('event1', 1, 1), ('event1', 1, 2);
      INSERT INTO rsvp_attendance (event_id, user_id, part_id, attending) VALUES ('event1', 1, 1, 1), ('event1', 1, 2, 0);
      INSERT INTO audit_log (event_id, actor, action, details, created_at) VALUES
        ('event1', 'user:1', 'rsvp.part.create', '{"partId":1}', 1),
        ('event1', 'user:1', 'rsvp.part.update', '{"partId":2}', 2),
        ('event1', 'user:1', 'rsvp.part.delete', '{"partId":3}', 3),
        ('event1', 'user:1', 'user.parts', '{"userId":1,"partIds":[1,2]}', 4),
        ('event1', 'user:1', 'invitation.parts', '{"invitationId":5,"partIds":[1]}', 5),
        ('event1', 'user:1', 'rsvp.answer', '{"userId":1}', 6);
    `);

    // The release being installed: all migrations.
    writeFileSync(journalFile, JSON.stringify(journal));
    expect(runMigrations(database, folder)).toBe(all.length - index);
    const rows = (sql: string) => database.sqlite.prepare(sql).all();

    expect(rows("SELECT id, name, has_meal FROM program_items ORDER BY id")).toEqual([
      { id: 1, name: "Dinner", has_meal: 1 },
      { id: 2, name: "Party", has_meal: 0 },
    ]);
    expect(rows("SELECT program_item_id FROM membership_program_items ORDER BY 1")).toEqual([
      { program_item_id: 1 },
      { program_item_id: 2 },
    ]);
    expect(
      rows("SELECT program_item_id, attending FROM rsvp_attendance ORDER BY program_item_id"),
    ).toEqual([
      { program_item_id: 1, attending: 1 },
      { program_item_id: 2, attending: 0 },
    ]);
    expect(rows("SELECT action, details FROM audit_log ORDER BY id")).toEqual([
      { action: "rsvp.program_item.create", details: '{"programItemId":1}' },
      { action: "rsvp.program_item.update", details: '{"programItemId":2}' },
      { action: "rsvp.program_item.delete", details: '{"programItemId":3}' },
      { action: "user.program_items", details: '{"userId":1,"programItemIds":[1,2]}' },
      { action: "invitation.program_items", details: '{"invitationId":5,"programItemIds":[1]}' },
      { action: "rsvp.answer", details: '{"userId":1}' },
    ]);
    // The old tables are gone and the foreign keys follow the renamed table: deleting a program
    // item still removes its answers and invitations, and one meal item per event stays enforced.
    expect(rows("SELECT name FROM sqlite_master WHERE name LIKE '%\\_parts%' ESCAPE '\\'")).toEqual(
      [],
    );
    database.sqlite.exec("DELETE FROM program_items WHERE id = 2;");
    expect(rows("SELECT count(*) AS n FROM rsvp_attendance")).toEqual([{ n: 1 }]);
    expect(rows("SELECT count(*) AS n FROM membership_program_items")).toEqual([{ n: 1 }]);
    expect(() =>
      database.sqlite.exec(
        "INSERT INTO program_items (event_id, name, starts_at, has_meal, created_at) VALUES ('event1', 'Zweites Essen', 3, 1, 1);",
      ),
    ).toThrow(/UNIQUE/);
    expect(database.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
