// What a passed run of the checks before a commit leaves behind, so that the same checks do not run twice on the same
// files: a key of the commit they were run on and the content of every changed file. A run in the working tree and the
// hook at the commit give the same key when the same files are committed unchanged, so a check made beforehand is not
// repeated by the hook. Any other file, other content or another commit under it gives another key, and everything runs.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export interface Entry {
  /** The repository path of a changed or new file. */
  path: string;
  /** The hash git gives its content (`git hash-object`; the same value as the one in the index once it is staged). */
  blob: string;
}

/** How many passed keys are kept. */
export const MAX_KEYS = 20;

/** The key of a set of changed files on a commit: the same for the same content, whatever the order. */
export function passKey(
  head: string,
  entries: readonly Entry[],
  deleted: readonly string[],
): string {
  const lines = [
    `head ${head}`,
    ...entries.map(({ path, blob }) => `file ${path} ${blob}`).sort(),
    ...deleted.map((path) => `deleted ${path}`).sort(),
  ];
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

/** The keys that passed, newest last. */
export function readPassed(file: string): string[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean);
}

/** Remembers a key that passed (the last `MAX_KEYS`). */
export function recordPass(file: string, key: string): void {
  const kept = readPassed(file).filter((known) => known !== key);
  writeFileSync(file, [...kept, key].slice(-MAX_KEYS).join("\n") + "\n");
}
