// Layout of the persistent data directory (DATA-01, sw-architecture.md 22.1).
// The database holds application data; image files and imported maps are files
// next to it, never stored in the database.
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export interface DataPaths {
  root: string;
  database: string;
  uploads: string;
  maps: string;
  /** A private event (events/<slug>/), read before the application's own (19.3.1). */
  events: string;
  /** Written by the running server (database/backup.ts: startHeartbeat). */
  heartbeat: string;
}

export function dataPaths(root: string): DataPaths {
  return {
    root,
    database: join(root, "zappaloo.db"),
    uploads: join(root, "uploads"),
    maps: join(root, "maps"),
    events: join(root, "events"),
    heartbeat: join(root, "server.heartbeat"),
  };
}

/** Creates the data directory and its subdirectories if they don't exist yet. */
export function ensureDataDirs(paths: DataPaths): void {
  for (const dir of [paths.root, paths.uploads, paths.maps, paths.events]) {
    mkdirSync(dir, { recursive: true });
  }
}
