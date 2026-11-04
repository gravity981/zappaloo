// Migration check (sw-architecture.md 23.2, DATA-04): migrations apply cleanly to
// an empty database and to a database at the schema of the latest release, and
// migrations that were already released are never changed or removed.
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, runMigrations } from "../../backend/src/database/database.ts";

/** SQL migration files of a migrations folder: file name → content. */
export function readMigrationFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const name of readdirSync(dir)
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    files.set(name, readFileSync(join(dir, name), "utf8"));
  }
  return files;
}

/** Errors for released migrations that are missing or changed in the current folder. */
export function compareReleasedMigrations(
  released: Map<string, string>,
  current: Map<string, string>,
): string[] {
  const errors: string[] = [];
  for (const [name, content] of released) {
    const now = current.get(name);
    if (now === undefined) errors.push(`released migration ${name} was removed`);
    else if (now !== content) errors.push(`released migration ${name} was changed`);
  }
  return errors;
}

/**
 * Applies `migrationsDir` to a fresh database, optionally after first bringing it
 * to the schema of `baseDir` (the latest release). Returns the number of
 * migrations applied in the second step. Throws if a migration fails.
 */
export function applyMigrations(migrationsDir: string, baseDir?: string): number {
  const dir = mkdtempSync(join(tmpdir(), "zappaloo-migration-check-"));
  const database = openDatabase(join(dir, "check.db"));
  try {
    if (baseDir) runMigrations(database, baseDir);
    return runMigrations(database, migrationsDir);
  } finally {
    database.close();
    rmSync(dir, { recursive: true, force: true });
  }
}
