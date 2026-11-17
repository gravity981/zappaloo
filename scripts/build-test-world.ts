// The test world package (sw-architecture.md 14.4, step 5d.1): three isometric maps with generated placeholder art,
// group layers, every object type, a portal tile with its trigger area, two figures and a door scene. It is a build
// output, not a file of the repository: `node scripts/build-test-world.ts [dir]` writes `zappaloo-world-test.tar.gz`
// into `dir` (default `dist/`, ignored by git). It is built from the code the tests use (backend/src/world/build.ts),
// so the tests and the script give the same package. It is for development and checks, not for events.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTestWorld } from "../backend/src/world/build.ts";

export const TEST_WORLD_FILE = "zappaloo-world-test.tar.gz";

/** Writes the test world into `dir` and returns the path of the file. */
export function writeTestWorld(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, TEST_WORLD_FILE);
  writeFileSync(path, buildTestWorld());
  return path;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(writeTestWorld(process.argv[2] ?? "dist"));
}
