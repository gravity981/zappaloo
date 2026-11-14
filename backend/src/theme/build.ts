// Builds theme packages (the shared encoder and archive writer are in packages/build.ts). The tests
// and the example package of the repository (step 4e-7) use the same code, so a package in a test is
// a real package.
import { buildArchive, encodePng } from "../packages/build.ts";

export { encodePng };

/** A gzip-compressed tar archive of the given files; folders are added for their paths. */
export const buildThemeArchive = buildArchive;

/** The colours of the minimal package: readable on every surface (19.7). */
export const VALID_COLORS = {
  background: "#f4f4f1",
  surface: "#ffffff",
  text: "#1f1f1d",
  muted: "#6a6a64",
  line: "#d5d5ce",
  accent: "#2a2a28",
  onAccent: "#ffffff",
};

/** The files of a package that passes every rule: manifest, theme, the three icons. */
export function validThemeFiles(
  overrides: Record<string, Buffer> = {},
  name = "Sommerfest",
): Record<string, Buffer> {
  return {
    "manifest.json": Buffer.from(
      JSON.stringify({ kind: "zappaloo-theme", formatVersion: 1, name }),
    ),
    "theme.json": Buffer.from(JSON.stringify({ colors: VALID_COLORS })),
    "icons/icon-192.png": encodePng(192, 192, [42, 42, 40]),
    "icons/icon-512.png": encodePng(512, 512, [42, 42, 40]),
    "icons/apple-touch-icon.png": encodePng(180, 180, [42, 42, 40]),
    ...overrides,
  };
}
