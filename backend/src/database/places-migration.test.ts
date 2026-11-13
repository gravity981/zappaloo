// The migration of the free-text places of the program items to places (CNT-07): the earlier
// migrations run, the program items get their texts, then the two new migrations run.
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

describe("the places migration (CNT-07)", () => {
  it("[CNT-07] free-text places become one place per text and event, and items refer to them", () => {
    directory = mkdtempSync(join(tmpdir(), "places-migration-"));
    database = openDatabase(join(directory, "zappaloo.db"));
    const sqlite = database.sqlite;
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    const before = files.filter((file) => file < "0013_");
    const after = files.filter((file) => file >= "0013_");
    expect(after).toEqual([
      "0013_content_places_and_images.sql",
      "0014_program_item_places.sql",
      "0015_image_owners.sql",
    ]);
    const apply = (file: string) => {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    };
    for (const file of before) apply(file);

    const now = Date.now();
    sqlite
      .prepare(
        "INSERT INTO events (id, name, timezone, default_language, created_at, updated_at) VALUES ('event1', 'Test', 'UTC', 'de', ?, ?)",
      )
      .run(now, now);
    const insertItem = sqlite.prepare(
      "INSERT INTO program_items (event_id, name, starts_at, place, has_meal, created_at) VALUES ('event1', ?, ?, ?, 0, ?)",
    );
    insertItem.run("Trauung", now, "Kirche Muri", now);
    insertItem.run("Apéro", now, " Kirche Muri ", now);
    insertItem.run("Dinner", now, "Landgasthof Linde", now);
    insertItem.run("Party", now, null, now);
    insertItem.run("Brunch", now, "   ", now);

    for (const file of after) apply(file);

    const places = sqlite
      .prepare("SELECT name FROM content_places WHERE event_id = 'event1' ORDER BY name")
      .all() as { name: string }[];
    expect(places.map((place) => place.name)).toEqual(["Kirche Muri", "Landgasthof Linde"]);

    const items = sqlite
      .prepare(
        "SELECT program_items.name AS item, content_places.name AS place FROM program_items LEFT JOIN content_places ON content_places.id = program_items.place_id ORDER BY program_items.id",
      )
      .all() as { item: string; place: string | null }[];
    expect(items).toEqual([
      { item: "Trauung", place: "Kirche Muri" },
      { item: "Apéro", place: "Kirche Muri" },
      { item: "Dinner", place: "Landgasthof Linde" },
      { item: "Party", place: null },
      { item: "Brunch", place: null },
    ]);

    const columns = (
      sqlite.prepare("PRAGMA table_info(program_items)").all() as { name: string }[]
    ).map((column) => column.name);
    expect(columns).not.toContain("place");
    expect(columns).toContain("place_id");
  });
});
