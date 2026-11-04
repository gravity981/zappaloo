// Command-line interface `zappaloo` (sw-architecture.md 23.8). Runs inside the
// application container (`docker compose exec app zappaloo <command>`) or from
// source (`npm run cli -- <command>`). Commands are added with their features.
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { backupDatabase, restoreDatabase } from "./database/backup.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { resolveVersion } from "./version.ts";

export interface CliIo {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  err: (line: string) => void;
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
    summary: "Consistent backup of the database while the app runs",
    usage: "backup <file>",
    run: async (args, io) => {
      const { positionals } = parseArgs({ args, allowPositionals: true });
      const target = positionals[0];
      if (!target) return usageError(io, "backup <file>");
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      const database = openDatabase(paths.database);
      try {
        await backupDatabase(database.sqlite, resolve(target));
        io.out(`Database backed up to ${resolve(target)}.`);
        return 0;
      } finally {
        database.close();
      }
    },
  },
  restore: {
    summary: "Replace the database with a backup (app stopped, --force)",
    usage: "restore <file> --force",
    run: (args, io) => {
      const { positionals, values } = parseArgs({
        args,
        allowPositionals: true,
        options: { force: { type: "boolean", default: false } },
      });
      const source = positionals[0];
      if (!source) return usageError(io, "restore <file> --force");
      const paths = dataPaths(loadConfig(io.env).DATA_DIR);
      restoreDatabase(paths, resolve(source), { force: values.force });
      io.out(`Database restored from ${resolve(source)}; migrations run on the next start.`);
      return 0;
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
  });
}
