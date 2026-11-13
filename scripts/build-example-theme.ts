// The example theme package (sw-architecture.md 19.7, step 4e-7): "Sommerfest", in the colours of the
// mock. It is a build output, not a file of the repository: `node scripts/build-example-theme.ts [dir]`
// writes `zappaloo-theme-example.tar.gz` into `dir` (default `dist/`, ignored by git). Each release
// attaches it as an asset (release-candidate.yml; promote.yml takes the candidate's file). It is built
// from the code the tests use (backend/src/theme/build.ts) with Node's built-in modules only, so the
// release job needs no install. The test in this folder checks it against the validator. The icons
// are plain placeholders: an operator replaces them by a package of their own.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildThemeArchive, encodePng } from "../backend/src/theme/build.ts";

export const EXAMPLE_FILE = "zappaloo-theme-example.tar.gz";

export const EXAMPLE_NAME = "Sommerfest";

export const EXAMPLE_COLORS = {
  background: "#f6f1e7",
  surface: "#ffffff",
  text: "#2b2a26",
  muted: "#5f5c55",
  line: "#d9d2c3",
  accent: "#2f6b4f",
  onAccent: "#ffffff",
};

export const EXAMPLE_WAITING = {
  card: "#fdfbf6",
  text: "#2b2a26",
  button: "#2f6b4f",
  onButton: "#ffffff",
};

/** The files of the package, by their paths in the archive. */
export function exampleFiles(): Record<string, Buffer> {
  const green: [number, number, number] = [0x2f, 0x6b, 0x4f];
  return {
    "manifest.json": Buffer.from(
      `${JSON.stringify({ kind: "zappaloo-theme", formatVersion: 1, name: EXAMPLE_NAME }, null, 2)}\n`,
    ),
    "theme.json": Buffer.from(
      `${JSON.stringify({ colors: EXAMPLE_COLORS, waiting: EXAMPLE_WAITING }, null, 2)}\n`,
    ),
    "icons/icon-192.png": encodePng(192, 192, green),
    "icons/icon-512.png": encodePng(512, 512, green),
    "icons/icon-maskable-512.png": encodePng(512, 512, green),
    "icons/apple-touch-icon.png": encodePng(180, 180, green),
  };
}

/** The archive of the example. The bytes are the same on every run. */
export function buildExample(): Buffer {
  return buildThemeArchive(exampleFiles());
}

/** Writes the example into `dir` and returns the path of the file. */
export function writeExample(dir: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, EXAMPLE_FILE);
  writeFileSync(path, buildExample());
  return path;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(writeExample(process.argv[2] ?? "dist"));
}
