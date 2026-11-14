import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkWorldPackage } from "../backend/src/world/validate.ts";
import { writeTestWorld, TEST_WORLD_FILE } from "./build-test-world.ts";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("the test world package (MAP-16, MAP-17)", () => {
  it("[MAP-16][MAP-17] the script writes the test world into the folder it is given, the same bytes every time", () => {
    const folder = mkdtempSync(join(tmpdir(), "zappaloo-world-"));
    folders.push(folder);
    const path = writeTestWorld(folder);
    expect(path).toBe(join(folder, TEST_WORLD_FILE));
    const written = readFileSync(path);
    expect(writeTestWorld(folder)).toBe(path);
    expect(readFileSync(path).equals(written)).toBe(true);
    expect(checkWorldPackage(written).ok).toBe(true);
  });
});
