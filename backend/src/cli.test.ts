import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.ts";
import type { CliIo } from "./cli.ts";
import { dataPaths } from "./data-dir.ts";
import { startHeartbeat } from "./database/backup.ts";
import { openDatabase } from "./database/database.ts";
import { tempDir } from "./test-support.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

async function run(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { env, out: (l) => out.push(l), err: (l) => err.push(l) };
  const code = await runCli(argv, io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

/** A migrated data directory whose database contains one guest. */
async function dataDirWithGuest(name: string): Promise<{ dataDir: string; dir: string }> {
  const dir = tempDir();
  cleanups.push(dir.remove);
  const dataDir = join(dir.path, "data");
  expect((await run(["migrate"], { DATA_DIR: dataDir })).code).toBe(0);
  const database = openDatabase(dataPaths(dataDir).database);
  database.sqlite.exec("CREATE TABLE guests (name TEXT)");
  database.sqlite.prepare("INSERT INTO guests VALUES (?)").run(name);
  database.close();
  return { dataDir, dir: dir.path };
}

function guests(dataDir: string): unknown[] {
  const database = openDatabase(dataPaths(dataDir).database);
  try {
    return database.sqlite.prepare("SELECT name FROM guests").all();
  } finally {
    database.close();
  }
}

describe("command-line interface", () => {
  it("[OPS-17] version prints version and commit", async () => {
    const result = await run(["version"], {
      APP_VERSION: "1.2.0",
      APP_VERSION_SUFFIX: "rc.2",
      APP_COMMIT: "abc123",
    });
    expect(result).toEqual({ code: 0, out: "1.2.0-rc.2 (abc123)", err: "" });
  });

  it("[OPS-17] migrate creates and migrates the database in DATA_DIR, then reports it is up to date", async () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const dataDir = join(dir.path, "data");

    const first = await run(["migrate"], { DATA_DIR: dataDir });
    expect(first.code).toBe(0);
    expect(existsSync(join(dataDir, "zappaloo.db"))).toBe(true);

    const second = await run(["migrate"], { DATA_DIR: dataDir });
    expect(second).toEqual({ code: 0, out: "Database is up to date.", err: "" });
  });

  it("[OPS-17] failures exit non-zero with a clear message", async () => {
    const missingConfig = await run(["migrate"], {});
    expect(missingConfig.code).toBe(1);
    expect(missingConfig.err).toMatch(/ConfigError: invalid configuration:\n {2}DATA_DIR/);

    const unknown = await run(["fly"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toMatch(/Unknown command "fly"/);

    expect((await run([])).code).toBe(1);
    const help = await run(["help"]);
    expect(help.code).toBe(0);
    expect(help.out).toContain("restore <file> --force");
  });

  it("[OPS-17] runs as its own process, as inside the container", () => {
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    const result = spawnSync(process.execPath, [cli, "version"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, APP_VERSION: "0.1.0", APP_COMMIT: "deadbeef" },
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0.1.0 (deadbeef)\n");
  });
});

describe("backup and restore", () => {
  it("[OPS-18] backup makes a consistent copy while the database is in use", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    // The app holds the database open, with uncommitted WAL content.
    const inUse = openDatabase(dataPaths(dataDir).database);
    inUse.sqlite.prepare("INSERT INTO guests VALUES (?)").run("Ben");
    const stopHeartbeat = startHeartbeat(dataPaths(dataDir));
    try {
      const target = join(dir, "backups", "2026-11-04_1.0.0.db");
      const result = await run(["backup", target], { DATA_DIR: dataDir });
      expect(result).toEqual({ code: 0, out: `Database backed up to ${target}.`, err: "" });

      const copy = openDatabase(target);
      expect(copy.sqlite.prepare("SELECT name FROM guests ORDER BY name").all()).toEqual([
        { name: "Anna" },
        { name: "Ben" },
      ]);
      copy.close();

      // Never overwrites an existing backup.
      const again = await run(["backup", target], { DATA_DIR: dataDir });
      expect(again.code).toBe(1);
      expect(again.err).toMatch(/already exists/);
    } finally {
      stopHeartbeat();
      inUse.close();
    }
  });

  it("[OPS-18] restore replaces the database with a backup when confirmed with --force", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    const backup = join(dir, "anna.db");
    expect((await run(["backup", backup], { DATA_DIR: dataDir })).code).toBe(0);

    // Later changes, including a write-ahead log that must not survive the restore.
    const database = openDatabase(dataPaths(dataDir).database);
    database.sqlite.prepare("DELETE FROM guests").run();
    database.sqlite.prepare("INSERT INTO guests VALUES (?)").run("Mallory");
    database.close();

    const refused = await run(["restore", backup], { DATA_DIR: dataDir });
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/--force/);
    expect(guests(dataDir)).toEqual([{ name: "Mallory" }]);

    const restored = await run(["restore", backup, "--force"], { DATA_DIR: dataDir });
    expect(restored.code).toBe(0);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
  });

  it("[OPS-18] restore refuses while the application is running", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    const backup = join(dir, "anna.db");
    expect((await run(["backup", backup], { DATA_DIR: dataDir })).code).toBe(0);

    const stopHeartbeat = startHeartbeat(dataPaths(dataDir));
    const whileRunning = await run(["restore", backup, "--force"], { DATA_DIR: dataDir });
    stopHeartbeat();
    expect(whileRunning.code).toBe(1);
    expect(whileRunning.err).toMatch(/the application is running; stop it first/);

    // A heartbeat left behind by a crashed server is stale and does not block.
    writeFileSync(dataPaths(dataDir).heartbeat, String(Date.now() - 60_000));
    expect((await run(["restore", backup, "--force"], { DATA_DIR: dataDir })).code).toBe(0);
  });

  it("[OPS-18] restore refuses files that are not an intact SQLite database", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    const notADatabase = join(dir, "notes.txt");
    writeFileSync(notADatabase, "not a database");
    for (const file of [notADatabase, join(dir, "missing.db")]) {
      const result = await run(["restore", file, "--force"], { DATA_DIR: dataDir });
      expect(result.code, file).toBe(1);
      expect(result.err, file).toMatch(/BackupError/);
    }
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
  });
});
