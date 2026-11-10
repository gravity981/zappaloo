// Command-line interface `zappaloo` (sw-architecture.md 23.8). Runs inside the
// application container (`docker compose exec app zappaloo <command>`) or from
// source (`npm run cli -- <command>`). Commands are added with their features.
import { createReadStream, createWriteStream, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { backupDatabase, restoreDatabase } from "./database/backup.ts";
import { backupFull, restoreFull } from "./database/full-backup.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { CLI_ACTOR, EventService, isFeatureName, isSettingName } from "./event/service.ts";
import { FEATURE_NAMES, SETTING_NAMES } from "@zappaloo/shared";
import { resolveVersion } from "./version.ts";

export interface CliIo {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  err: (line: string) => void;
  /** Raw standard streams, for `backup -` and `restore -`. */
  stdin?: NodeJS.ReadableStream;
  stdout?: NodeJS.WritableStream;
}

/** A temporary directory, removed after `use` finished. */
async function withTempDir<T>(use: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), "zappaloo-"));
  try {
    return await use(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

interface Command {
  summary: string;
  usage?: string;
  run: (args: string[], io: CliIo) => number | Promise<number>;
}

const commands: Record<string, Command> = {
  version: {
    summary: "Print version and commit",
    run: (_args, io) => {
      const { version, commit } = resolveVersion(io.env);
      io.out(`${version} (${commit})`);
      return 0;
    },
  },
  migrate: {
    summary: "Apply pending database migrations",
    run: (_args, io) => {
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      ensureDataDirs(paths);
      const database = openDatabase(paths.database);
      try {
        const applied = runMigrations(database);
        io.out(applied === 0 ? "Database is up to date." : `Applied ${applied} migration(s).`);
        return 0;
      } finally {
        database.close();
      }
    },
  },
  backup: {
    summary:
      "Consistent backup while the app runs; --full adds the files as .tar.gz (- : to stdout)",
    usage: "backup [--full] <file|->",
    run: async (args, io) => {
      const { positionals, values } = parseArgs({
        args,
        allowPositionals: true,
        options: { full: { type: "boolean", default: false } },
      });
      const target = positionals[0];
      if (!target) return usageError(io, "backup [--full] <file|->");
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      const database = openDatabase(paths.database);
      try {
        if (values.full) {
          if (target === "-") {
            // e.g. docker compose exec -T app zappaloo backup --full - > backups/x.tar.gz
            if (!io.stdout) throw new Error("no standard output available");
            await backupFull(database.sqlite, paths, io.stdout);
            io.err("Full backup written to standard output.");
          } else {
            await backupFull(database.sqlite, paths, resolve(target));
            io.out(`Full backup written to ${resolve(target)}.`);
          }
          return 0;
        }
        if (target !== "-") {
          await backupDatabase(database.sqlite, resolve(target));
          io.out(`Database backed up to ${resolve(target)}.`);
          return 0;
        }
        // To stdout, e.g. docker compose exec -T app zappaloo backup - > backups/x.db
        const stdout = io.stdout;
        if (!stdout) throw new Error("no standard output available");
        await withTempDir(async (dir) => {
          const file = join(dir, "backup.db");
          await backupDatabase(database.sqlite, file);
          await pipeline(createReadStream(file), stdout, { end: false });
        });
        io.err("Database backed up to standard output.");
        return 0;
      } finally {
        database.close();
      }
    },
  },
  restore: {
    summary: "Replace the database (--full: and files) with a backup (app stopped; - : from stdin)",
    usage: "restore [--full] <file|-> --force",
    run: async (args, io) => {
      const { positionals, values } = parseArgs({
        args,
        allowPositionals: true,
        options: {
          force: { type: "boolean", default: false },
          full: { type: "boolean", default: false },
        },
      });
      const source = positionals[0];
      if (!source) return usageError(io, "restore [--full] <file|-> --force");
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      if (values.full) {
        // From stdin, e.g. docker compose run --rm --no-deps -T app zappaloo restore --full - --force < x.tar.gz
        if (source === "-") {
          if (!io.stdin) throw new Error("no standard input available");
          await restoreFull(paths, io.stdin, { force: values.force });
        } else {
          await restoreFull(paths, resolve(source), { force: values.force });
        }
        io.out("Database and files restored; migrations run on the next start.");
        return 0;
      }
      if (source !== "-") {
        restoreDatabase(paths, resolve(source), { force: values.force });
        io.out(`Database restored from ${resolve(source)}; migrations run on the next start.`);
        return 0;
      }
      // From stdin, e.g. docker compose run --rm -T app zappaloo restore - --force < backups/x.db
      const stdin = io.stdin;
      if (!stdin) throw new Error("no standard input available");
      await withTempDir(async (dir) => {
        const file = join(dir, "restore.db");
        await pipeline(stdin, createWriteStream(file));
        restoreDatabase(paths, file, { force: values.force });
      });
      io.out("Database restored from standard input; migrations run on the next start.");
      return 0;
    },
  },
  event: {
    summary: "Show the event, or switch a feature or setting on or off (audited)",
    usage: "event show | feature <name> on|off | setting <name> on|off",
    run: (args, io) => {
      const [action, name, state] = args;
      const usageText = "event show | feature <name> on|off | setting <name> on|off";
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      const database = openDatabase(paths.database);
      try {
        const event = EventService.forInstallation(database);
        if (action === "show" && args.length === 1) {
          const current = event.get();
          const line = (flags: Record<string, boolean>) =>
            Object.entries(flags)
              .map(([key, on]) => `  ${key}: ${on ? "on" : "off"}`)
              .join("\n");
          io.out(
            [
              `${current.name} (${current.id}), ${current.timezone}, ${current.defaultLanguage}`,
              "Features:",
              line(current.features),
              "Settings:",
              line(current.settings),
            ].join("\n"),
          );
          return 0;
        }
        if ((action === "feature" || action === "setting") && name && args.length === 3) {
          if (state !== "on" && state !== "off") return usageError(io, usageText);
          const on = state === "on";
          if (action === "feature") {
            if (!isFeatureName(name)) {
              io.err(`Unknown feature "${name}"; known: ${FEATURE_NAMES.join(", ")}.`);
              return 1;
            }
            const changed = event.setFeature(name, on, CLI_ACTOR);
            io.out(
              changed
                ? `Feature ${name} is now ${state}.`
                : `Feature ${name} was already ${state}.`,
            );
          } else {
            if (!isSettingName(name)) {
              io.err(`Unknown setting "${name}"; known: ${SETTING_NAMES.join(", ")}.`);
              return 1;
            }
            const changed = event.setSetting(name, on, CLI_ACTOR);
            io.out(
              changed
                ? `Setting ${name} is now ${state}.`
                : `Setting ${name} was already ${state}.`,
            );
          }
          return 0;
        }
        return usageError(io, usageText);
      } finally {
        database.close();
      }
    },
  },
};

function usageError(io: CliIo, usage: string): number {
  io.err(`Usage: zappaloo ${usage}`);
  return 1;
}

function usage(): string {
  const width = Math.max(
    ...Object.entries(commands).map(([name, command]) => (command.usage ?? name).length),
  );
  const lines = Object.entries(commands).map(
    ([name, command]) => `  ${(command.usage ?? name).padEnd(width)}  ${command.summary}`,
  );
  return ["Usage: zappaloo <command>", "", "Commands:", ...lines].join("\n");
}

/** Runs one command; resolves to the process exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [name, ...args] = argv;
  if (name === undefined || name === "help" || name === "--help" || name === "-h") {
    io.out(usage());
    return name === undefined ? 1 : 0;
  }
  const command = commands[name];
  if (!command) {
    io.err(`Unknown command "${name}".\n\n${usage()}`);
    return 1;
  }
  try {
    return await command.run(args, io);
  } catch (error) {
    io.err(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await runCli(process.argv.slice(2), {
    env: process.env,
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
    stdin: process.stdin,
    stdout: process.stdout,
  });
}
