// Writes the generated files of the package formats:
//   node scripts/schemas/cli.ts [schemasDir] [docsDir]
// The JSON Schemas go to `schemas/` (committed; the test in this folder fails when they differ from
// the code). The Markdown documents go to `dist/formats/` (build output, not committed; the release
// candidate attaches them, and promotion takes them from the candidate's release).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { generatedDocuments, generatedSchemas } from "./schemas.ts";

/** Writes every given file into `dir`; returns the paths written. */
function writeAll(dir: string, files: Record<string, string>): string[] {
  mkdirSync(dir, { recursive: true });
  return Object.entries(files).map(([name, text]) => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  });
}

/** Writes the JSON Schemas into `dir`; returns the paths written. */
export function writeSchemas(dir: string): string[] {
  return writeAll(dir, generatedSchemas());
}

/** Writes the Markdown documents into `dir`; returns the paths written. */
export function writeDocuments(dir: string): string[] {
  return writeAll(dir, generatedDocuments());
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const schemasDir = process.argv[2] ?? fileURLToPath(new URL("../../schemas", import.meta.url));
  const docsDir = process.argv[3] ?? fileURLToPath(new URL("../../dist/formats", import.meta.url));
  for (const path of [...writeSchemas(schemasDir), ...writeDocuments(docsDir)]) console.log(path);
}
