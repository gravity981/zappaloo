// The git hook finds Node.js where it can: here, or in the dev container (git may run on the host, where there is no
// Node.js; the hook is shared through .git/config). The tests run the real hook with a fake `node` and a fake
// `docker` as the only commands on its PATH (plus the few tools it uses), and look at what the fakes were asked to do.
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const hook = join(process.cwd(), ".githooks/pre-commit");

/** The tools the hook itself uses besides `command` and `echo`, which the shell has built in. */
const TOOLS = ["grep", "head", "cut"];

/** A folder that is the whole PATH of a test: the fake commands (each logs its arguments, then runs its body) and the tools. */
function pathWith(commands: Record<string, string>): { bin: string; log: string } {
  const bin = mkdtempSync(join(tmpdir(), "hook-"));
  const log = join(bin, "log");
  for (const [name, body] of Object.entries(commands)) {
    writeFileSync(join(bin, name), `#!/bin/sh\n${body.replaceAll("$LOG", log)}\n`);
    chmodSync(join(bin, name), 0o755);
  }
  for (const tool of TOOLS) {
    const real = ["/usr/bin", "/bin"]
      .map((dir) => join(dir, tool))
      .find((file) => existsSync(file));
    if (real !== undefined) symlinkSync(real, join(bin, tool));
  }
  return { bin, log };
}

function runHook(path: string): { status: number | null; output: string } {
  const result = spawnSync("/bin/sh", [hook], { env: { PATH: path }, encoding: "utf8" });
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("the pre-commit hook", () => {
  it("runs the checks with the Node.js at hand", () => {
    const { bin, log } = pathWith({ node: 'echo "$@" >> $LOG' });
    expect(runHook(bin).status).toBe(0);
    expect(readFileSync(log, "utf8").trim()).toBe("scripts/precommit/cli.ts");
  });

  it("without Node.js, runs the checks in the dev container of the repository", () => {
    const { bin, log } = pathWith({
      docker: `if [ "$1" = ps ]; then
  printf '%s\\n' 'aaa111 \\\\wsl.localhost\\Ubuntu\\home\\nicolas\\zappaloo\\world\\assets' 'bbb222 \\\\wsl.localhost\\Ubuntu\\home\\nicolas\\zappaloo' 'ccc333 '
else echo "$@" >> $LOG; fi`,
    });
    const { status, output } = runHook(bin);
    expect(status).toBe(0);
    expect(output).toContain("running the checks in the dev container bbb222");
    // The container of the repository (not the one of a folder inside it), the user of the container, the folder.
    expect(readFileSync(log, "utf8").trim()).toBe(
      "exec -u vscode -w /workspaces/zappaloo bbb222 node scripts/precommit/cli.ts",
    );
  });

  it("without Node.js and without a dev container, refuses the commit and says why", () => {
    // Docker is there, but no container of the repository is running.
    const { bin } = pathWith({ docker: 'if [ "$1" = ps ]; then exit 0; fi' });
    const noContainer = runHook(bin);
    expect(noContainer.status).toBe(1);
    expect(noContainer.output).toContain("neither node nor a running dev container");
    expect(noContainer.output).toContain("--no-verify");
    // No Docker either.
    expect(runHook(pathWith({}).bin).status).toBe(1);
  });
});
