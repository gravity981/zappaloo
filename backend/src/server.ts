// Starts the application: configuration, data directory, database migrations
// (sw-architecture.md 23.5: migrations run on startup; if they fail, the app
// does not start), then the HTTP server.
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { startHeartbeat } from "./database/backup.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { resolveVersion } from "./version.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const version = resolveVersion(config);
  const paths = dataPaths(config.DATA_DIR);
  ensureDataDirs(paths);

  const database = openDatabase(paths.database);
  const applied = runMigrations(database);

  const app = await buildApp({
    database,
    version,
    frontendDir: config.FRONTEND_DIR,
    logger: { level: config.APP_ENV === "test" ? "warn" : "info" },
  });
  app.log.info({ version, dataDir: paths.root, migrationsApplied: applied }, "starting");

  // Lets `zappaloo restore` see that the database is in use.
  const stopHeartbeat = startHeartbeat(paths);

  const shutdown = (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => {
      stopHeartbeat();
      database.close();
      process.exit(0);
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exit(1);
});
