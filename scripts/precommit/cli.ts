// node scripts/precommit/cli.ts [--worktree] [--force]
//
// The checks before a commit (spec/test-strategy.md 8.2), on the changed files only: Prettier, ESLint, `tsc` in the
// workspaces that contain changed files, and the unit tests related to them. The files are the staged ones; without
// any (or with --worktree) every changed or new file of the working tree, as an agent or a developer checks before
// staging. The git hook (.githooks/pre-commit) runs it; all steps run, and the exit code says whether all passed.
// A run that passed is remembered by the commit and the content of the changed files (cache.ts): the same files, committed
// unchanged, are not checked again by the hook. --force checks anyway.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";
import { readPassed, recordPass } from "./cache.ts";
import { changedFiles, git, keyOf } from "./changes.ts";
import { planChecks } from "./plan.ts";

const { values } = parseArgs({
  options: {
    worktree: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
  },
});

interface Step {
  name: string;
  command: string;
  args: string[];
}

const changes = changedFiles(values.worktree);
const { files: found, deleted, source } = changes;
const files = found.filter((file) => existsSync(file));
if (files.length === 0 && deleted.length === 0) {
  console.log("precommit: no changed files, nothing to check.");
  process.exit(0);
}
console.log(`precommit: ${String(files.length)} file(s) ${source}.`);

// The same files with the same content on the same commit have passed before (a run in the working tree, or this hook
// on an earlier try): the checks would find the same.
const passedFile = git(["rev-parse", "--git-path", "precommit-passed"]).trim();
const key = keyOf({ ...changes, files });
if (!values.force && readPassed(passedFile).includes(key)) {
  console.log(
    "precommit: these files have already passed the checks, as they are now; not run again (--force runs them).",
  );
  process.exit(0);
}

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
if (failed.length === 0) recordPass(passedFile, key);
console.log(
  failed.length === 0
    ? `\nprecommit: all ${String(steps.length)} checks passed.`
    : `\nprecommit: failed: ${failed.join(", ")}.`,
);
process.exit(failed.length === 0 ? 0 : 1);
