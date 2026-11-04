// Helpers for backend tests: a fresh data directory and database per test, and
// the app built on top of them (requests via app.inject, no port opened).
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import type { AppOptions } from "./app.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import type { DataPaths } from "./data-dir.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import type { Database } from "./database/database.ts";

export const TEST_VERSION = { version: "1.2.3+test", commit: "abc123" };

export function tempDir(prefix = "zappaloo-test-"): { path: string; remove: () => void } {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return {
    path,
    remove: () => {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export interface TestContext {
  app: FastifyInstance;
  database: Database;
  paths: DataPaths;
  /** Closes app and database and deletes the data directory. */
  close: () => Promise<void>;
}

/**
 * Builds the app on a fresh, migrated database. The app is not `ready` yet, so a
 * test can register extra routes before the first request.
 */
export async function createTestApp(options: Partial<AppOptions> = {}): Promise<TestContext> {
  const dir = tempDir();
  const paths = dataPaths(join(dir.path, "data"));
  ensureDataDirs(paths);
  const database = openDatabase(paths.database);
  runMigrations(database);
  const app = await buildApp({ database, version: TEST_VERSION, ...options });
  return {
    app,
    database,
    paths,
    close: async () => {
      await app.close();
      database.close();
      dir.remove();
    },
  };
}
