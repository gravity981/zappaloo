// The migration of the menus to two lists (RSVP-19): every menu that exists is an adults' menu, so
// nobody's choice moves and the admin creates the children's list.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MIGRATIONS_DIR, openDatabase } from "./database.ts";
import type { Database } from "./database.ts";

let directory: string | undefined;
let database: Database | undefined;
afterEach(() => {
  database?.close();
  database = undefined;
  if (directory) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("the children's menus migration (RSVP-19)", () => {
  it("[RSVP-19] every existing menu becomes a menu of the adults' list and keeps its id", () => {
    directory = mkdtempSync(join(tmpdir(), "children-menus-migration-"));
    database = openDatabase(join(directory, "zappaloo.db"));
    const sqlite = database.sqlite;
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const apply = (file: string) => {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    };
    for (const file of files.filter((f) => f < "0025_")) apply(file);

    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO events (id, name, timezone, default_language, created_at, updated_at) VALUES ('event1', 'Test', 'UTC', 'de', ?, ?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO menu_options (id, event_id, name, created_at) VALUES (3, 'event1', 'Fleisch', ?), (8, 'event1', 'Kindermenü', ?)",
      )
      .run(now, now);

    apply(files.find((f) => f.startsWith("0025_")) ?? "");

    expect(
      sqlite
        .prepare("SELECT id, name, for_children AS forChildren FROM menu_options ORDER BY id")
        .all(),
    ).toEqual([
      { id: 3, name: "Fleisch", forChildren: 0 },
      { id: 8, name: "Kindermenü", forChildren: 0 },
    ]);
  });
});
