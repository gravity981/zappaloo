// Starts the application: configuration, data directory, database migrations
// (sw-architecture.md 23.5: migrations run on startup; if they fail, the app
// does not start), then the HTTP server.
import { buildApp } from "./app.ts";
import { loadConfig } from "./config.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { startHeartbeat } from "./database/backup.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { loadEvent } from "./event/config.ts";
import { bootstrapEvent, EventService } from "./event/service.ts";
import { createAuth, startHousekeeping } from "./auth/setup.ts";
import { createMailer } from "./mail/mailer.ts";
import { resolveVersion } from "./version.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const version = resolveVersion(config);
  const paths = dataPaths(config.DATA_DIR);
  ensureDataDirs(paths);

  // The event is validated before anything else is touched: an invalid
  // configuration stops the start with a clear error (CFG-02).
  const loaded = loadEvent(config.EVENT_SLUG, [paths.events, config.EVENTS_DIR]);

  const database = openDatabase(paths.database);
  const applied = runMigrations(database);
  bootstrapEvent(database, loaded.config);

  const event = new EventService(database, loaded.config.id);
  const auth = createAuth(database, event, config, createMailer(config));
  const app = await buildApp({
    database,
    event,
    auth,
    trustProxy: config.TRUST_PROXY,
    version,
    frontendDir: config.FRONTEND_DIR,
    logger: { level: config.APP_ENV === "test" ? "warn" : "info" },
  });
  app.log.info(
    {
      version,
      dataDir: paths.root,
      migrationsApplied: applied,
      event: loaded.config.id,
      eventDir: loaded.dir,
    },
    "starting",
  );

  // Lets `zappaloo restore` see that the database is in use.
  const stopHeartbeat = startHeartbeat(paths);
  const stopHousekeeping = startHousekeeping(auth, (deleted) => {
    app.log.info(deleted, "deleted expired sessions and links");
  });

  const shutdown = (signal: string) => {
    app.log.info(`${signal} received, shutting down`);
    void app.close().then(() => {
      stopHeartbeat();
      stopHousekeeping();
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
