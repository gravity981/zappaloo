// Database backup and restore for the CLI (OPS-18, sw-architecture.md 23.8).
// Covers the database only; files (maps, photos) are covered by the off-site backups.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import Sqlite from "better-sqlite3";
import type { DataPaths } from "../data-dir.ts";

export class BackupError extends Error {
  override name = "BackupError";
}

/** A running server rewrites this file every few seconds (see startHeartbeat). */
const HEARTBEAT_INTERVAL_MS = 5_000;
const HEARTBEAT_STALE_MS = 3 * HEARTBEAT_INTERVAL_MS;

/**
 * Marks the data directory as in use by a running server, so that `restore`
 * (run in another container on the same volume) can refuse. Returns a function
 * that stops the heartbeat and removes the marker.
 */
export function startHeartbeat(paths: DataPaths, now: () => number = Date.now): () => void {
  const beat = () => {
    writeFileSync(paths.heartbeat, String(now()));
  };
  beat();
  const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
    rmSync(paths.heartbeat, { force: true });
  };
}

export function isServerRunning(paths: DataPaths, now: number = Date.now()): boolean {
  if (!existsSync(paths.heartbeat)) return false;
  const last = Number(readFileSync(paths.heartbeat, "utf8"));
  return Number.isFinite(last) && now - last < HEARTBEAT_STALE_MS;
}

/** Consistent copy of the database while it is in use (SQLite online backup). */
export async function backupDatabase(sqlite: Sqlite.Database, target: string): Promise<void> {
  if (existsSync(target)) throw new BackupError(`${target} already exists; choose a new file name`);
  mkdirSync(dirname(target), { recursive: true });
  await sqlite.backup(target);
}

export function assertValidDatabase(file: string): void {
  if (!existsSync(file)) throw new BackupError(`${file} does not exist`);
  let db: Sqlite.Database | undefined;
  try {
    db = new Sqlite(file, { readonly: true, fileMustExist: true });
    const result = db.pragma("integrity_check", { simple: true });
    if (result !== "ok") throw new BackupError(`${file} is damaged: ${String(result)}`);
  } catch (error) {
    if (error instanceof BackupError) throw error;
    throw new BackupError(`${file} is not a SQLite database`, { cause: error });
  } finally {
    db?.close();
  }
}

/** A restore needs the application stopped and an explicit `force`. */
export function assertRestorable(
  paths: DataPaths,
  options: { force: boolean; now?: number },
  replaces: string,
): void {
  if (isServerRunning(paths, options.now)) {
    throw new BackupError(
      "the application is running; stop it first (docker compose stop app), then restore with docker compose run --rm app zappaloo restore …",
    );
  }
  if (!options.force) {
    throw new BackupError(`this replaces ${replaces}; repeat with --force to confirm`);
  }
}

/**
 * Replaces the database with a backup. Only while no server uses the data
 * directory, and only with `force`. Pending migrations run on the next start.
 */
export function restoreDatabase(
  paths: DataPaths,
  source: string,
  options: { force: boolean; now?: number },
): void {
  assertValidDatabase(source);
  assertRestorable(paths, options, paths.database);
  mkdirSync(dirname(paths.database), { recursive: true });
  const temporary = `${paths.database}.restoring`;
  copyFileSync(source, temporary);
  // The old database's write-ahead log must not be applied to the restored file.
  for (const leftover of [`${paths.database}-wal`, `${paths.database}-shm`]) {
    rmSync(leftover, { force: true });
  }
  renameSync(temporary, paths.database);
}
