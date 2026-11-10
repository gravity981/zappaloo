import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { tempDir } from "../test-support.ts";
import { MigrationError, openDatabase, runMigrations } from "./database.ts";
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
