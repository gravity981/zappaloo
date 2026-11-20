// Points git at the repository's hooks (.githooks), so that every commit runs the checks before a commit. It runs
// after `npm install` (the `prepare` script); without a git repository, nothing happens.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".git") && existsSync(".githooks")) {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"]);
}
