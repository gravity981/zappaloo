// Writes the JSON Schemas of the package formats into `schemas/` (the default) or the folder given:
//   node scripts/schemas/cli.ts [dir]
// The committed files are the output of this script; the test in this folder fails when they differ.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatedSchemas } from "./schemas.ts";

/** Writes every schema into `dir`; returns the paths written. */
export function writeSchemas(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  return Object.entries(generatedSchemas()).map(([name, text]) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? fileURLToPath(new URL("../../schemas", import.meta.url));
  for (const path of writeSchemas(dir)) console.log(path);
}
