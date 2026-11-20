// node scripts/precommit/cli.ts [--worktree]
//
// The checks before a commit (spec/test-strategy.md 8.2), on the changed files only: Prettier, ESLint, `tsc` in the
// workspaces that contain changed files, and the unit tests related to them. The files are the staged ones; without
// any (or with --worktree) every changed or new file of the working tree, as an agent or a developer checks before
// staging. The git hook (.githooks/pre-commit) runs it; all steps run, and the exit code says whether all passed.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { planChecks } from "./plan.ts";

const { values } = parseArgs({ options: { worktree: { type: "boolean", default: false } } });

function lines(command: string, args: string[]): string[] {
  return execFileSync(command, args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function changedFiles(): { files: string[]; source: string } {
  if (!values.worktree) {
    const staged = lines("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
    if (staged.length > 0) return { files: staged, source: "staged" };
  }
  const tracked = lines("git", ["diff", "HEAD", "--name-only", "--diff-filter=ACMR"]);
  const added = lines("git", ["ls-files", "--others", "--exclude-standard"]);
  return { files: [...new Set([...tracked, ...added])], source: "changed in the working tree" };
}

interface Step {
  name: string;
  command: string;
  args: string[];
}

const { files: found, source } = changedFiles();
const files = found.filter((file) => existsSync(file));
if (files.length === 0) {
  console.log("precommit: no changed files, nothing to check.");
  process.exit(0);
}
console.log(`precommit: ${String(files.length)} file(s) ${source}.`);

const plan = planChecks(files);
const steps: Step[] = [];
if (plan.format.length > 0) {
  steps.push({
    name: "Prettier",
    command: "npx",
    args: ["prettier", "--check", "--ignore-unknown", ...plan.format],
  });
}
if (plan.lint.length > 0) {
  steps.push({
    name: "ESLint",
    command: "npx",
    args: ["eslint", "--max-warnings", "0", "--no-warn-ignored", ...plan.lint],
  });
}
for (const workspace of plan.typecheck.workspaces) {
  steps.push({
    name: `tsc in ${workspace}`,
    command: "npm",
    args: ["run", "typecheck", "--silent", "-w", workspace],
  });
}
if (plan.typecheck.root) {
  steps.push({
    name: "tsc in the root project",
    command: "npx",
    args: ["tsc", "-p", "tsconfig.json"],
  });
}
if (plan.related.length > 0) {
  steps.push({
    name: "Related unit tests",
    command: "npm",
    args: ["run", "test:related", "--silent", "--", ...plan.related],
  });
}

const failed: string[] = [];
for (const step of steps) {
  console.log(`\n── ${step.name}`);
  const result = spawnSync(step.command, step.args, { stdio: "inherit" });
  if (result.status !== 0) failed.push(step.name);
}
console.log(
  failed.length === 0
    ? `\nprecommit: all ${String(steps.length)} checks passed.`
    : `\nprecommit: failed: ${failed.join(", ")}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
