// Reads the last release and the commit from git (used by the version CLI and
// the frontend build configuration).
import { execFileSync } from "node:child_process";
import { lastRelease } from "../../shared/src/version.ts";

function git(args: string[], cwd?: string): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/** Highest release tag vX.Y.Z (without pre-release suffix) reachable from HEAD, or 0.0.0. */
export function gitLastRelease(cwd?: string): string {
  return lastRelease(
    git(["describe", "--tags", "--abbrev=0", "--match", "v[0-9]*", "--exclude", "*-*"], cwd),
  );
}

export function gitCommit(cwd?: string): string {
  return git(["rev-parse", "HEAD"], cwd) ?? "unknown";
}

export function gitShortCommit(cwd?: string): string {
  return git(["rev-parse", "--short", "HEAD"], cwd) ?? "unknown";
}
