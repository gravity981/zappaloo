// npm run db:reset-dev (followed by `event seed-example` in the npm script)
//
// Deletes the development data in DATA_DIR: the database (with its WAL and shared-memory files),
// the events folder (icons, images), uploads and maps. Nothing else in the folder is touched.
// Refuses unless APP_ENV is dev, and while a server is using the data directory.
import { existsSync, rmSync } from "node:fs";
import { loadConfig } from "../../backend/src/config.ts";
import { dataPaths } from "../../backend/src/data-dir.ts";
import { isServerRunning } from "../../backend/src/database/backup.ts";

// Checked before the configuration is loaded: a production configuration may not load here at all.
const appEnv = process.env.APP_ENV ?? "(unset)";
if (appEnv !== "dev") {
  console.error(`refused: APP_ENV is ${appEnv}; the reset is for dev only`);
  process.exit(1);
}
const config = loadConfig();

const paths = dataPaths(config.DATA_DIR);
if (isServerRunning(paths)) {
  console.error(
    `refused: a server is using ${paths.root}; stop the task "dev: backend" first, then run the reset again`,
  );
  process.exit(1);
}

const targets = [
  paths.database,
  `${paths.database}-wal`,
  `${paths.database}-shm`,
  paths.events,
  paths.uploads,
  paths.maps,
  paths.heartbeat,
];
for (const target of targets) {
  if (!existsSync(target)) continue;
  rmSync(target, { recursive: true, force: true });
  console.log(`deleted ${target}`);
}
console.log(`cleared the development data in ${paths.root}`);
