import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkThemePackage } from "../backend/src/theme/validate.ts";
import { buildExample, EXAMPLE_FILE, writeExample } from "./build-example-theme.ts";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("the example theme package (THM-02, THM-03)", () => {
  it("[THM-02][THM-03] the example passes every rule of the validator", () => {
    expect(checkThemePackage(buildExample()).ok).toBe(true);
  });

  it("[THM-02][THM-03] the script writes the example into the folder it is given, the same bytes every time", () => {
    const folder = mkdtempSync(join(tmpdir(), "zappaloo-example-"));
    folders.push(folder);
    const path = writeExample(folder);
    expect(path).toBe(join(folder, EXAMPLE_FILE));
    expect(readFileSync(path).equals(buildExample())).toBe(true);
    expect(checkThemePackage(readFileSync(path)).ok).toBe(true);
  });
});
