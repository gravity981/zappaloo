import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.ts";
import type { CliIo } from "./cli.ts";
import { BUNDLED_EVENTS_DIR } from "./config.ts";
import { dataPaths } from "./data-dir.ts";
import { loadEvent } from "./event/config.ts";
import { bootstrapEvent, EventService } from "./event/service.ts";
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
    expect(help.out).toContain("restore [--full] <file|-> --force");
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

  it("[OPS-18] backup - and restore - stream the database through stdout and stdin", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    const env = { PATH: process.env.PATH, DATA_DIR: dataDir };

    // As in: docker compose exec -T app zappaloo backup - > backups/x.db
    const backup = spawnSync(process.execPath, [cli, "backup", "-"], { env });
    expect(backup.status).toBe(0);
    expect(backup.stderr.toString()).toBe("Database backed up to standard output.\n");
    const file = join(dir, "streamed.db");
    writeFileSync(file, backup.stdout);
    const copy = openDatabase(file);
    expect(copy.sqlite.prepare("SELECT name FROM guests").all()).toEqual([{ name: "Anna" }]);
    copy.close();

    const database = openDatabase(dataPaths(dataDir).database);
    database.sqlite.prepare("UPDATE guests SET name = 'Mallory'").run();
    database.close();

    // As in: docker compose run --rm -T app zappaloo restore - --force < backups/x.db
    const restore = spawnSync(process.execPath, [cli, "restore", "-", "--force"], {
      env,
      input: backup.stdout,
    });
    expect(restore.stderr.toString()).toBe("");
    expect(restore.status).toBe(0);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);

    // Garbage on stdin is rejected and the database stays.
    const garbage = spawnSync(process.execPath, [cli, "restore", "-", "--force"], {
      env,
      input: "not a database",
    });
    expect(garbage.status).toBe(1);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
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

describe("full backup and restore", () => {
  function writeFiles(dataDir: string, files: Record<string, string>): void {
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dataDir, name)), { recursive: true });
      writeFileSync(join(dataDir, name), content);
    }
  }

  it("[OPS-05] backup --full holds the database and the files and restore --full brings both back", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    writeFiles(dataDir, {
      "uploads/a.jpg": "photo A",
      "maps/town/map.json": "{}",
      "events/our-day/event.json": "{}",
    });
    const archive = join(dir, "full.tar.gz");

    // While the app runs: a heartbeat and a held database.
    const inUse = openDatabase(dataPaths(dataDir).database);
    const stopHeartbeat = startHeartbeat(dataPaths(dataDir));
    try {
      const result = await run(["backup", "--full", archive], { DATA_DIR: dataDir });
      expect(result).toEqual({ code: 0, out: `Full backup written to ${archive}.`, err: "" });
      const again = await run(["backup", "--full", archive], { DATA_DIR: dataDir });
      expect(again.code).toBe(1);
      expect(again.err).toMatch(/already exists/);
    } finally {
      stopHeartbeat();
      inUse.close();
    }

    // Later changes: another guest, a changed and a new file.
    const database = openDatabase(dataPaths(dataDir).database);
    database.sqlite.prepare("DELETE FROM guests").run();
    database.close();
    writeFiles(dataDir, { "uploads/a.jpg": "changed", "uploads/b.jpg": "new" });

    const refused = await run(["restore", "--full", archive], { DATA_DIR: dataDir });
    expect(refused.code).toBe(1);
    expect(refused.err).toMatch(/--force/);

    const restored = await run(["restore", "--full", archive, "--force"], { DATA_DIR: dataDir });
    expect(restored.code).toBe(0);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
    expect(readFileSync(join(dataDir, "uploads/a.jpg"), "utf8")).toBe("photo A");
    expect(existsSync(join(dataDir, "uploads/b.jpg"))).toBe(false);
    expect(readFileSync(join(dataDir, "maps/town/map.json"), "utf8")).toBe("{}");
    // A private event in the data volume is part of the backup.
    expect(readFileSync(join(dataDir, "events/our-day/event.json"), "utf8")).toBe("{}");
    expect(readdirSync(dataDir).filter((n) => n.startsWith(".restore-"))).toEqual([]);
  });

  it("[OPS-05] restore --full refuses while the application is running", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    const archive = join(dir, "full.tar.gz");
    expect((await run(["backup", "--full", archive], { DATA_DIR: dataDir })).code).toBe(0);
    const stopHeartbeat = startHeartbeat(dataPaths(dataDir));
    const result = await run(["restore", "--full", archive, "--force"], { DATA_DIR: dataDir });
    stopHeartbeat();
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/the application is running; stop it first/);
  });

  it("[OPS-05] restore --full leaves everything unchanged for an invalid archive", async () => {
    const { dataDir, dir } = await dataDirWithGuest("Anna");
    writeFiles(dataDir, { "uploads/a.jpg": "photo A" });
    const env = { DATA_DIR: dataDir };

    const garbage = join(dir, "garbage.tar.gz");
    writeFileSync(garbage, "not an archive");
    // A plain .db backup, and a tar without the database.
    const plain = join(dir, "plain.db");
    expect((await run(["backup", plain], env)).code).toBe(0);
    const noDatabase = join(dir, "no-db.tar.gz");
    mkdirSync(join(dir, "src/uploads"), { recursive: true });
    writeFileSync(join(dir, "src/uploads/x.jpg"), "x");
    expect(spawnSync("tar", ["-czf", noDatabase, "-C", join(dir, "src"), "uploads"]).status).toBe(
      0,
    );
    // A tar with a database that is not a database.
    const badDatabase = join(dir, "bad-db.tar.gz");
    writeFileSync(join(dir, "src/zappaloo.db"), "nope");
    expect(
      spawnSync("tar", ["-czf", badDatabase, "-C", join(dir, "src"), "zappaloo.db", "uploads"])
        .status,
    ).toBe(0);

    for (const file of [garbage, plain, noDatabase, badDatabase, join(dir, "missing.tar.gz")]) {
      const result = await run(["restore", "--full", file, "--force"], env);
      expect(result.code, file).toBe(1);
      expect(result.err, file).toMatch(/BackupError/);
    }
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
    expect(readFileSync(join(dataDir, "uploads/a.jpg"), "utf8")).toBe("photo A");
    expect(readdirSync(dataDir).filter((n) => n.startsWith(".restore-"))).toEqual([]);
  });

  it("[OPS-05] backup --full - and restore --full - stream the archive through stdout and stdin", async () => {
    const { dataDir } = await dataDirWithGuest("Anna");
    writeFiles(dataDir, { "uploads/a.jpg": "photo A" });
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    const env = { PATH: process.env.PATH, DATA_DIR: dataDir };

    // As in: docker compose exec -T app zappaloo backup --full - > backups/x.tar.gz
    const backup = spawnSync(process.execPath, [cli, "backup", "--full", "-"], { env });
    expect(backup.status).toBe(0);
    expect(backup.stderr.toString()).toBe("Full backup written to standard output.\n");

    rmSync(join(dataDir, "uploads/a.jpg"));
    const database = openDatabase(dataPaths(dataDir).database);
    database.sqlite.prepare("UPDATE guests SET name = 'Mallory'").run();
    database.close();

    // As in: docker compose run --rm --no-deps -T app zappaloo restore --full - --force < x.tar.gz
    const restore = spawnSync(process.execPath, [cli, "restore", "--full", "-", "--force"], {
      env,
      input: backup.stdout,
    });
    expect(restore.stderr.toString()).toBe("");
    expect(restore.status).toBe(0);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
    expect(readFileSync(join(dataDir, "uploads/a.jpg"), "utf8")).toBe("photo A");

    const garbage = spawnSync(process.execPath, [cli, "restore", "--full", "-", "--force"], {
      env,
      input: "not an archive",
    });
    expect(garbage.status).toBe(1);
    expect(guests(dataDir)).toEqual([{ name: "Anna" }]);
  });
});

describe("event commands", () => {
  /** A migrated data directory with the example event, as after the first start. */
  async function dataDirWithEvent(): Promise<string> {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const dataDir = join(dir.path, "data");
    expect((await run(["migrate"], { DATA_DIR: dataDir })).code).toBe(0);
    const database = openDatabase(dataPaths(dataDir).database);
    bootstrapEvent(database, loadEvent("event-muster", [BUNDLED_EVENTS_DIR]).config);
    database.close();
    return dataDir;
  }

  it("[CFG-05] event show lists the event with its features and settings", async () => {
    const dataDir = await dataDirWithEvent();
    const result = await run(["event", "show"], { DATA_DIR: dataDir });
    expect(result.code).toBe(0);
    expect(result.out).toContain("Event Muster (event-muster), Europe/Zurich, de");
    expect(result.out).toContain("  minigames: on");
    expect(result.out).toContain("  platformOpen: off");
  });

  it("[CFG-03][CFG-05] feature and setting switch values at runtime, and the audit log records them as cli", async () => {
    const dataDir = await dataDirWithEvent();
    const env = { DATA_DIR: dataDir };
    expect(await run(["event", "feature", "gallery", "off"], env)).toEqual({
      code: 0,
      out: "Feature gallery is now off.",
      err: "",
    });
    expect((await run(["event", "feature", "gallery", "off"], env)).out).toBe(
      "Feature gallery was already off.",
    );
    expect((await run(["event", "setting", "platformOpen", "on"], env)).out).toBe(
      "Setting platformOpen is now on.",
    );

    const shown = (await run(["event", "show"], env)).out;
    expect(shown).toContain("  gallery: off");
    expect(shown).toContain("  platformOpen: on");

    const database = openDatabase(dataPaths(dataDir).database);
    const log = EventService.forInstallation(database).auditEntries();
    database.close();
    expect(log.map((e) => [e.actor, e.action, e.details])).toEqual([
      ["cli", "setting.set", { name: "platformOpen", from: false, to: true }],
      ["cli", "feature.set", { name: "gallery", from: true, to: false }],
    ]);
  });

  it("[CFG-03] refuses unknown names, wrong usage and a database without an event", async () => {
    const dataDir = await dataDirWithEvent();
    const env = { DATA_DIR: dataDir };
    const unknownFeature = await run(["event", "feature", "karaoke", "on"], env);
    expect(unknownFeature.code).toBe(1);
    expect(unknownFeature.err).toContain('Unknown feature "karaoke"; known: minigames');
    expect((await run(["event", "setting", "platformopen", "on"], env)).err).toContain(
      "Unknown setting",
    );
    for (const args of [
      ["event"],
      ["event", "feature", "gallery"],
      ["event", "feature", "gallery", "yes"],
    ]) {
      const result = await run(args, env);
      expect(result.code, args.join(" ")).toBe(1);
      expect(result.err, args.join(" ")).toMatch(/Usage: zappaloo event/);
    }

    const empty = tempDir();
    cleanups.push(empty.remove);
    const emptyEnv = { DATA_DIR: join(empty.path, "data") };
    expect((await run(["migrate"], emptyEnv)).code).toBe(0);
    const noEvent = await run(["event", "show"], emptyEnv);
    expect(noEvent.code).toBe(1);
    expect(noEvent.err).toMatch(/no event yet; start the application once/);
  });
});
