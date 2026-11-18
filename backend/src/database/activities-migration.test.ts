// The migration of program items to program items with activities (RSVP-18): every program item
// keeps its id, invitations and answers, and gets one activity with its former name, time and place.
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

describe("the activities migration (RSVP-18)", () => {
  it("[RSVP-18] each program item gets one activity with its former fields; invitations and answers stay", () => {
    directory = mkdtempSync(join(tmpdir(), "activities-migration-"));
    database = openDatabase(join(directory, "zappaloo.db"));
    const sqlite = database.sqlite;
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const apply = (file: string) => {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    };
    for (const file of files.filter((f) => f < "0024_")) apply(file);

    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO events (id, name, timezone, default_language, created_at, updated_at) VALUES ('event1', 'Test', 'UTC', 'de', ?, ?)",
      )
      .run(now, now);
    sqlite
      .prepare(
        "INSERT INTO content_places (id, event_id, name, address, created_at, updated_at) VALUES (1, 'event1', 'Kirche Muri', '', ?, ?)",
      )
      .run(now, now);
    const insertItem = sqlite.prepare(
      "INSERT INTO program_items (id, event_id, name, starts_at, ends_at, place_id, has_meal, created_at) VALUES (?, 'event1', ?, ?, ?, ?, ?, ?)",
    );
    insertItem.run(7, "Trauung", 1000, 2000, 1, 0, now);
    insertItem.run(9, "Dinner", 3000, null, null, 1, now);
    sqlite.exec(`
      INSERT INTO users (id, username, display_name, created_at, updated_at) VALUES (1, 'anna', 'Anna', 1, 1);
      INSERT INTO memberships (event_id, user_id, created_at) VALUES ('event1', 1, 1);
      INSERT INTO membership_program_items (event_id, user_id, program_item_id) VALUES ('event1', 1, 9);
      INSERT INTO rsvp_attendance (event_id, user_id, program_item_id, attending) VALUES ('event1', 1, 9, 1);
    `);

    apply("0024_program_item_activities.sql");

    const rows = sqlite
      .prepare(
        "SELECT program_item_id AS item, name, starts_at AS startsAt, ends_at AS endsAt, place_id AS placeId FROM activities ORDER BY program_item_id",
      )
      .all();
    expect(rows).toEqual([
      { item: 7, name: "Trauung", startsAt: 1000, endsAt: 2000, placeId: 1 },
      { item: 9, name: "Dinner", startsAt: 3000, endsAt: null, placeId: null },
    ]);
    const items = sqlite
      .prepare("SELECT id, name, has_meal AS hasMeal FROM program_items ORDER BY id")
      .all();
    expect(items).toEqual([
      { id: 7, name: "Trauung", hasMeal: 0 },
      { id: 9, name: "Dinner", hasMeal: 1 },
    ]);
    const columns = (
      sqlite.prepare("PRAGMA table_info(program_items)").all() as { name: string }[]
    ).map((column) => column.name);
    expect(columns).not.toContain("starts_at");
    expect(columns).not.toContain("ends_at");
    expect(columns).not.toContain("place_id");
    expect(
      sqlite.prepare("SELECT program_item_id AS id FROM membership_program_items").all(),
    ).toEqual([{ id: 9 }]);
    expect(
      sqlite.prepare("SELECT program_item_id AS id, attending FROM rsvp_attendance").all(),
    ).toEqual([{ id: 9, attending: 1 }]);
  });
});
