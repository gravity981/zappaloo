import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_KEYS, passKey, readPassed, recordPass } from "./cache.ts";

const entries = [
  { path: "a.ts", blob: "111" },
  { path: "b.ts", blob: "222" },
];

describe("the memory of a passed run of the checks before a commit", () => {
  it("the same files with the same content on the same commit give the same key, in any order", () => {
    expect(passKey("head1", entries, [])).toBe(passKey("head1", [...entries].reverse(), []));
  });

  it("another content, file, commit or deletion gives another key", () => {
    const key = passKey("head1", entries, []);
    const changed = [
      { path: "a.ts", blob: "999" },
      { path: "b.ts", blob: "222" },
    ];
    expect(passKey("head1", changed, [])).not.toBe(key);
    expect(passKey("head1", entries.slice(0, 1), [])).not.toBe(key);
    expect(passKey("head2", entries, [])).not.toBe(key);
    expect(passKey("head1", entries, ["gone.ts"])).not.toBe(key);
  });

  it("remembers a key that passed, once, and forgets the oldest beyond the limit", () => {
    const file = join(mkdtempSync(join(tmpdir(), "passed-")), "precommit-passed");
    expect(readPassed(file)).toEqual([]);
    recordPass(file, "one");
    recordPass(file, "two");
    recordPass(file, "one");
    expect(readPassed(file)).toEqual(["two", "one"]);
    for (let n = 0; n < MAX_KEYS + 5; n++) recordPass(file, `key${String(n)}`);
    const kept = readPassed(file);
    expect(kept).toHaveLength(MAX_KEYS);
    expect(kept.at(-1)).toBe(`key${String(MAX_KEYS + 4)}`);
    expect(kept).not.toContain("two");
  });
});
