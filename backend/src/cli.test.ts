import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.ts";
import type { CliIo } from "./cli.ts";
import { tempDir } from "./test-support.ts";

const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => {
    cleanup();
  });
});

function run(argv: string[], env: NodeJS.ProcessEnv = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const io: CliIo = { env, out: (l) => out.push(l), err: (l) => err.push(l) };
  const code = runCli(argv, io);
  return { code, out: out.join("\n"), err: err.join("\n") };
}

describe("command-line interface", () => {
  it("[OPS-17] version prints version and commit", () => {
    const result = run(["version"], {
      APP_VERSION: "1.2.0",
      APP_VERSION_SUFFIX: "rc.2",
      APP_COMMIT: "abc123",
    });
    expect(result).toEqual({ code: 0, out: "1.2.0-rc.2 (abc123)", err: "" });
  });

  it("[OPS-17] migrate creates and migrates the database in DATA_DIR, then reports it is up to date", () => {
    const dir = tempDir();
    cleanups.push(dir.remove);
    const dataDir = join(dir.path, "data");

    const first = run(["migrate"], { DATA_DIR: dataDir });
    expect(first.code).toBe(0);
    expect(existsSync(join(dataDir, "zappaloo.db"))).toBe(true);

    const second = run(["migrate"], { DATA_DIR: dataDir });
    expect(second).toEqual({ code: 0, out: "Database is up to date.", err: "" });
  });

  it("[OPS-17] failures exit non-zero with a clear message", () => {
    const missingConfig = run(["migrate"], {});
    expect(missingConfig.code).toBe(1);
    expect(missingConfig.err).toMatch(/ConfigError: invalid configuration:\n {2}DATA_DIR/);

    const unknown = run(["fly"]);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toMatch(/Unknown command "fly"/);

    expect(run([]).code).toBe(1);
    expect(run(["help"])).toMatchObject({
      code: 0,
      out: expect.stringContaining("migrate") as string,
    });
  });

  it("[OPS-17] runs as its own process, as inside the container", () => {
    const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));
    const result = spawnSync(process.execPath, [cli, "version"], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, APP_VERSION: "0.1.0", APP_COMMIT: "deadbeef" },
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("0.1.0 (deadbeef)\n");
  });
});
