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
import { loadEvent } from "./event/config.ts";
import { bootstrapEvent, EventService } from "./event/service.ts";
import { BUNDLED_EVENTS_DIR } from "./config.ts";

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
  /** The example event (events/event-muster), created in the database. */
  event: EventService;
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
  const loaded = loadEvent("event-muster", [BUNDLED_EVENTS_DIR]);
  bootstrapEvent(database, loaded.config);
  const event = new EventService(database, loaded.config.id);
  let app: FastifyInstance;
  try {
    app = await buildApp({ database, event, version: TEST_VERSION, ...options });
  } catch (error) {
    database.close();
    dir.remove();
    throw error;
  }
  return {
    app,
    database,
    event,
    paths,
    close: async () => {
      await app.close();
      database.close();
      dir.remove();
    },
  };
}
