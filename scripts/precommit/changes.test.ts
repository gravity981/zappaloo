// The files of a commit and the key of a passed run, against a real git repository: the key must be the same for the
// same changes whether they are staged or only in the working tree, also when a file is renamed (git shows a staged
// rename as one entry, the working tree as a deletion and a new file).
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { changedFiles, keyOf } from "./changes.ts";

function repository(): string {
  const dir = mkdtempSync(join(tmpdir(), "changes-"));
  const run = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  run("init", "-q");
  run("config", "user.email", "test@example.com");
  run("config", "user.name", "Test");
  run("config", "commit.gpgsign", "false");
  mkdirSync(join(dir, "src"));
  writeFileSync(join(dir, "src/old.ts"), "export const a = 1;\n".repeat(20));
  writeFileSync(join(dir, "src/keep.ts"), "export const b = 2;\n");
  run("add", "-A");
  run("commit", "-q", "-m", "first");
  return dir;
}

const stage = (dir: string) => execFileSync("git", ["add", "-A"], { cwd: dir });

describe("the changes of a commit and the key of a passed run", () => {
  it("a file renamed and a file added give the same key staged and in the working tree", () => {
    const dir = repository();
    renameSync(join(dir, "src/old.ts"), join(dir, "src/new.ts"));
    writeFileSync(join(dir, "src/extra.ts"), "export const c = 3;\n");

    const worktree = changedFiles(true, dir);
    stage(dir);
    const staged = changedFiles(false, dir);

    // A rename is a deletion and an addition on both sides, not one entry on one side.
    expect(worktree.deleted).toEqual(["src/old.ts"]);
    expect(staged.deleted).toEqual(["src/old.ts"]);
    expect([...staged.files].sort()).toEqual(["src/extra.ts", "src/new.ts"]);
    expect([...worktree.files].sort()).toEqual([...staged.files].sort());
    expect(staged.staged).toBe(true);
    expect(worktree.staged).toBe(false);
    expect(keyOf(staged, dir)).toBe(keyOf(worktree, dir));
  });

  it("another content, another file or a deleted file gives another key", () => {
    const dir = repository();
    writeFileSync(join(dir, "src/keep.ts"), "export const b = 3;\n");
    const first = keyOf(changedFiles(true, dir), dir);
    writeFileSync(join(dir, "src/keep.ts"), "export const b = 4;\n");
    const second = keyOf(changedFiles(true, dir), dir);
    expect(second).not.toBe(first);
    writeFileSync(join(dir, "src/more.ts"), "export const d = 5;\n");
    expect(keyOf(changedFiles(true, dir), dir)).not.toBe(second);
  });

  it("without staged files the working tree is checked; a staged subset is only that subset", () => {
    const dir = repository();
    writeFileSync(join(dir, "src/keep.ts"), "export const b = 9;\n");
    writeFileSync(join(dir, "src/other.ts"), "export const e = 1;\n");
    expect(changedFiles(false, dir).source).toBe("changed in the working tree");
    execFileSync("git", ["add", "src/keep.ts"], { cwd: dir });
    const subset = changedFiles(false, dir);
    expect(subset.files).toEqual(["src/keep.ts"]);
    expect(subset.source).toBe("staged");
  });
});
