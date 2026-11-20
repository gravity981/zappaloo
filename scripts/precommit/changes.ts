// The files a commit would change, as the checks before a commit see them (spec/test-strategy.md 8.2), and the key that
// remembers a passed run (cache.ts). The staged files, or the changed and new files of the working tree: both are listed
// without rename detection, so a rename is a deletion and an addition on both sides and the same files give the same
// key whether they are staged or not (git would show a staged rename as one entry, and the working tree as two).
import { execFileSync } from "node:child_process";
import { type Entry, passKey } from "./cache.ts";

export interface Changes {
  /** Changed, added and copied files that exist, from the repository root. */
  files: string[];
  /** Files that are deleted. */
  deleted: string[];
  /** What the files are: for the message. */
  source: string;
  /** Whether they are the staged ones (their content is the one in the index). */
  staged: boolean;
}

export function git(args: string[], cwd?: string): string {
  return execFileSync("git", args, { encoding: "utf8", ...(cwd === undefined ? {} : { cwd }) });
}

function lines(args: string[], cwd?: string): string[] {
  return git(args, cwd).split("\n").filter(Boolean);
}

/**
 * The staged files; without any, or with `worktree`, the files changed since HEAD and the new ones that git does not
 * ignore.
 */
export function changedFiles(worktree: boolean, cwd?: string): Changes {
  const diff = (base: string[], filter: string): string[] =>
    lines(["diff", ...base, "--no-renames", "--name-only", `--diff-filter=${filter}`], cwd);
  if (!worktree) {
    const staged = diff(["--cached"], "ACMR");
    if (staged.length > 0) {
      return { files: staged, deleted: diff(["--cached"], "D"), source: "staged", staged: true };
    }
  }
  const tracked = diff(["HEAD"], "ACMR");
  const added = lines(["ls-files", "--others", "--exclude-standard"], cwd);
  return {
    files: [...new Set([...tracked, ...added])],
    deleted: diff(["HEAD"], "D"),
    source: "changed in the working tree",
    staged: false,
  };
}

/** The content hash of each file: the one in the index for staged files, the one of the file otherwise. */
export function entriesOf(files: string[], staged: boolean, cwd?: string): Entry[] {
  if (files.length === 0) return [];
  if (staged) {
    return git(["ls-files", "-s", "-z", "--", ...files], cwd)
      .split("\0")
      .filter(Boolean)
      .map((record) => {
        const [meta = "", path = ""] = record.split("\t");
        return { path, blob: meta.split(" ")[1] ?? "" };
      });
  }
  const blobs = lines(["hash-object", "--", ...files], cwd);
  return files.map((path, index) => ({ path, blob: blobs[index] ?? "" }));
}

/** The commit the files are checked against, or `none` before the first commit. */
export function headCommit(cwd?: string): string {
  try {
    return git(["rev-parse", "--verify", "-q", "HEAD"], cwd).trim();
  } catch {
    return "none";
  }
}

/** The key of a set of changes on the current commit (cache.ts). */
export function keyOf(changes: Changes, cwd?: string): string {
  return passKey(headCommit(cwd), entriesOf(changes.files, changes.staged, cwd), changes.deleted);
}
