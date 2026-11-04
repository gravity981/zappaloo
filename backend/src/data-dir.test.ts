import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { tempDir } from "./test-support.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

describe("persistent data directory", () => {
  it("[DATA-01] application data is stored in a SQLite database file in the data directory", () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const paths = dataPaths(join(dir.path, "data"));
    ensureDataDirs(paths);

    const database = openDatabase(paths.database);
    runMigrations(database);
    database.close();

    expect(paths.database).toBe(join(dir.path, "data", "zappaloo.db"));
    // Every SQLite database file starts with this header.
    expect(readFileSync(paths.database).subarray(0, 16).toString("latin1")).toBe(
      "SQLite format 3\0",
    );
  });

  it("[DATA-01] uploaded images and imported maps have their own directories next to the database", () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const paths = dataPaths(join(dir.path, "data"));
    ensureDataDirs(paths);

    for (const folder of [paths.uploads, paths.maps]) {
      expect(statSync(folder).isDirectory()).toBe(true);
      expect(folder.startsWith(paths.root)).toBe(true);
      expect(folder).not.toBe(paths.database);
    }
    // Creating them again (every startup) is harmless.
    ensureDataDirs(paths);
    expect(existsSync(paths.uploads)).toBe(true);
  });
});
