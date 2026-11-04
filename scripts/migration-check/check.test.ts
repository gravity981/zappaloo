import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyMigrations, compareReleasedMigrations, readMigrationFiles } from "./check.ts";

const dirs: string[] = [];
afterEach(() => {
  dirs.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  });
});

/** A migrations folder in drizzle-kit's format with the given SQL migrations. */
function migrations(...sql: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "zappaloo-mc-"));
  dirs.push(dir);
  mkdirSync(join(dir, "meta"));
  const entries = sql.map((_, idx) => ({
    idx,
    version: "6",
    when: 1_700_000_000_000 + idx * 1000,
    tag: `000${idx}_m`,
    breakpoints: true,
  }));
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "sqlite", entries }),
  );
  sql.forEach((statement, idx) => {
    writeFileSync(join(dir, `000${idx}_m.sql`), statement);
  });
  return dir;
}

const CREATE = "CREATE TABLE guests (id INTEGER PRIMARY KEY, name TEXT NOT NULL);";
const ADD_COLUMN = "ALTER TABLE guests ADD COLUMN attending INTEGER NOT NULL DEFAULT 0;";

describe("migration check", () => {
  it("[DATA-04] new migrations apply to an empty database and on top of the latest release", () => {
    const released = migrations(CREATE);
    const current = migrations(CREATE, ADD_COLUMN);
    expect(applyMigrations(current)).toBe(2);
    expect(applyMigrations(current, released)).toBe(1);
  });

  it("[DATA-04] a migration that fails on the release's schema is reported", () => {
    const released = migrations(CREATE);
    const current = migrations(CREATE, "ALTER TABLE guest ADD COLUMN x INTEGER;");
    expect(() => applyMigrations(current, released)).toThrow(/no such table: guest/);
  });

  it("[DATA-04] released migrations must not be changed or removed", () => {
    const released = readMigrationFiles(migrations(CREATE, ADD_COLUMN));
    expect(
      compareReleasedMigrations(
        released,
        readMigrationFiles(migrations(CREATE, ADD_COLUMN, "SELECT 1;")),
      ),
    ).toEqual([]);
    expect(compareReleasedMigrations(released, readMigrationFiles(migrations(CREATE)))).toEqual([
      "released migration 0001_m.sql was removed",
    ]);
    expect(
      compareReleasedMigrations(
        released,
        readMigrationFiles(migrations(CREATE, `${ADD_COLUMN} -- edited`)),
      ),
    ).toEqual(["released migration 0001_m.sql was changed"]);
  });
});
