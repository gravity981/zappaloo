// Full backup and restore of the data directory: database and files (uploads,
// imported maps and tilesets) in one .tar.gz archive (OPS-05, sw-architecture.md 22.2, 23.8).
//
// Archive layout: zappaloo.db, uploads/, maps/ (the database is a consistent
// SQLite online backup, never the live file). Uses the system `tar`.
import { spawn } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

import type Sqlite from "better-sqlite3";
import type { DataPaths } from "../data-dir.ts";
import {
  assertRestorable,
  assertValidDatabase,
  BackupError,
  backupDatabase,
  restoreDatabase,
} from "./backup.ts";

const DATABASE_ENTRY = "zappaloo.db";
const FILE_DIRS = ["uploads", "maps", "events"] as const;

/** Runs `tar`; `input`/`output` are connected to its standard streams. */
function runTar(
  args: string[],
  streams: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", args, {
      stdio: [streams.input ? "pipe" : "ignore", streams.output ? "pipe" : "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const piping: Promise<unknown>[] = [];
    if (streams.input && child.stdin) {
      // tar may exit before it has read everything (damaged archive): the exit code tells.
      piping.push(pipeline(streams.input, child.stdin).catch(() => undefined));
    }
    if (streams.output && child.stdout) {
      piping.push(pipeline(child.stdout, streams.output, { end: false }));
    }
    child.on("error", (error) => {
      reject(new BackupError("cannot run tar", { cause: error }));
    });
    child.on("close", (code) => {
      Promise.all(piping).then(
        () => {
          if (code === 0) resolve();
          else
            reject(new BackupError(`tar failed: ${stderr.trim() || `exit code ${String(code)}`}`));
        },
        (error: unknown) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
      );
    });
  });
}

/**
 * Full backup while the application runs: a consistent database copy plus the
 * files. `target` is a new file or, to stream it, a writable stream.
 */
export async function backupFull(
  sqlite: Sqlite.Database,
  paths: DataPaths,
  target: string | NodeJS.WritableStream,
): Promise<void> {
  if (typeof target === "string" && existsSync(target)) {
    throw new BackupError(`${target} already exists; choose a new file name`);
  }
  const staging = mkdtempSync(join(tmpdir(), "zappaloo-full-"));
  try {
    await backupDatabase(sqlite, join(staging, DATABASE_ENTRY));
    const files = FILE_DIRS.filter((dir) => existsSync(join(paths.root, dir)));
    const args = [
      "-czf",
      typeof target === "string" ? target : "-",
      "-C",
      staging,
      DATABASE_ENTRY,
      ...files.flatMap((dir) => ["-C", paths.root, dir]),
    ];
    await runTar(args, typeof target === "string" ? {} : { output: target });
  } catch (error) {
    if (typeof target === "string") rmSync(target, { force: true });
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/** Every entry of the extracted archive must be a plain file or directory. */
function assertPlainEntries(dir: string): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) assertPlainEntries(path);
    else if (!stat.isFile())
      throw new BackupError(`the archive contains an unsupported entry: ${name}`);
  }
}

/**
 * Replaces database and files with a full backup (`source`: a file, or a stream
 * such as standard input). Only while the application is stopped, and only
 * with `force`. Nothing is touched unless the archive is valid.
 */
export async function restoreFull(
  paths: DataPaths,
  source: string | NodeJS.ReadableStream,
  options: { force: boolean; now?: number },
): Promise<void> {
  assertRestorable(paths, options, `the database and files in ${paths.root}`);
  if (typeof source === "string" && !existsSync(source)) {
    throw new BackupError(`${source} does not exist`);
  }
  mkdirSync(paths.root, { recursive: true });
  // Inside the data directory, so the pieces can be moved into place by rename.
  const staging = mkdtempSync(join(paths.root, ".restore-"));
  try {
    await runTar(
      ["-xzf", typeof source === "string" ? source : "-", "--no-same-owner", "-C", staging],
      typeof source === "string" ? {} : { input: source },
    );
    const entries = readdirSync(staging);
    const allowed = new Set<string>([DATABASE_ENTRY, ...FILE_DIRS]);
    const unexpected = entries.filter((name) => !allowed.has(name));
    if (unexpected.length > 0) {
      throw new BackupError(`not a full backup: unexpected entries ${unexpected.join(", ")}`);
    }
    if (!entries.includes(DATABASE_ENTRY)) {
      throw new BackupError(`not a full backup: ${DATABASE_ENTRY} is missing`);
    }
    for (const dir of FILE_DIRS) {
      if (entries.includes(dir) && !lstatSync(join(staging, dir)).isDirectory()) {
        throw new BackupError(`not a full backup: ${dir} is not a directory`);
      }
    }
    assertPlainEntries(staging);
    assertValidDatabase(join(staging, DATABASE_ENTRY));

    // Validated: replace the files, then the database.
    for (const dir of FILE_DIRS) {
      // Backups made before stage 2 have no events/: keep the installation's event files,
      // or it would not start any more (19.3.1).
      if (dir === "events" && !entries.includes(dir)) continue;
      rmSync(paths[dir], { recursive: true, force: true });
      if (entries.includes(dir)) renameSync(join(staging, dir), paths[dir]);
      else mkdirSync(paths[dir]);
    }
    restoreDatabase(paths, join(staging, DATABASE_ENTRY), options);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
