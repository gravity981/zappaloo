// Command-line interface `zappaloo` (sw-architecture.md 23.8). Runs inside the
// application container (`docker compose exec app zappaloo <command>`) or from
// source (`npm run cli -- <command>`). Commands are added with their features.
import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.ts";
import { dataPaths, ensureDataDirs } from "./data-dir.ts";
import { openDatabase, runMigrations } from "./database/database.ts";
import { resolveVersion } from "./version.ts";

export interface CliIo {
  env: NodeJS.ProcessEnv;
  out: (line: string) => void;
  err: (line: string) => void;
}

interface Command {
  summary: string;
  run: (args: string[], io: CliIo) => number;
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
};

function usage(): string {
  const width = Math.max(...Object.keys(commands).map((name) => name.length));
  const lines = Object.entries(commands).map(
    ([name, command]) => `  ${name.padEnd(width)}  ${command.summary}`,
  );
  return ["Usage: zappaloo <command>", "", "Commands:", ...lines].join("\n");
}

/** Runs one command; returns the process exit code. */
export function runCli(argv: string[], io: CliIo): number {
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
    return command.run(args, io);
  } catch (error) {
    io.err(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = runCli(process.argv.slice(2), {
    env: process.env,
    out: (line) => {
      console.log(line);
    },
    err: (line) => {
      console.error(line);
    },
  });
}
