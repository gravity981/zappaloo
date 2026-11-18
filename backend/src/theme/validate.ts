// The validator of the theme package (sw-architecture.md 19.7, THM-03). It checks the whole package
// and returns every finding with its file and reason; nothing is imported from here. A package with
// a finding is refused, and the active theme stays as it was.
import { z } from "zod";
import {
  THEME_FORMAT_VERSIONS,
  themeContrastChecks,
  THEME_LIMITS,
  themeJsonSchema,
  themeManifestSchema,
} from "@zappaloo/shared";
import type { ThemeJson, ThemeManifest } from "@zappaloo/shared";
import { themeV2 } from "@zappaloo/shared";
import { pngSize } from "../packages/png.ts";
import { readPackageArchive, TarError } from "../packages/archive.ts";

import type { ThemeFindingCode } from "@zappaloo/shared";
export type { ThemeFindingCode };

export interface ThemeFinding {
  /** The file of the package the finding is about, or `(archive)`. */
  file: string;
  code: ThemeFindingCode;
  /** The reason in words, for the admin (the field, the size, the ratio). */
  detail: string;
}

export interface ThemePackage {
  manifest: ThemeManifest;
  theme: ThemeJson;
  /** Every file of the package by its path. */
  files: Map<string, Buffer>;
}

export type ThemeCheck =
  { ok: true; package: ThemePackage } | { ok: false; findings: ThemeFinding[] };

/** The icons of the layout (19.7), from the package definition: the required ones, then the optional ones. */
const ICONS = themeV2.layout.filter((entry) => entry.kind === "png" && entry.size !== undefined);
const REQUIRED_ICONS: [string, number][] = ICONS.filter((entry) => entry.required).map((entry) => [
  entry.path,
  entry.size?.width ?? 0,
]);
const OPTIONAL_ICONS: [string, number][] = ICONS.filter((entry) => !entry.required).map((entry) => [
  entry.path,
  entry.size?.width ?? 0,
]);

/** The folders of the layout (19.7), from the package definition. */
const FOLDERS = themeV2.layout
  .filter((entry) => entry.kind === "folder")
  .map((entry) => entry.path);

/** The files of the layout (19.7): an entry of the definition matches the path. */
function inLayout(path: string): boolean {
  return themeV2.layout.some((entry) => entry.match.test(path));
}

/** The fields of a zod issue as a path with its message, for the findings. */
function fieldDetail(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(file)"}: ${issue.message}`)
    .join("; ");
}

/** Reads one JSON file of the package, recording a finding when it is missing or not JSON. */
function readJson(name: string, files: Map<string, Buffer>, findings: ThemeFinding[]): unknown {
  const bytes = files.get(name);
  if (bytes === undefined) {
    findings.push({ file: name, code: "file_missing", detail: "the file is missing" });
    return undefined;
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push({ file: name, code: "json_invalid", detail: "not valid JSON" });
    return undefined;
  }
}

/**
 * The check of one font file: WOFF2, and at most 2 MB (19.7). The validator runs it on every file of
 * a package; the theme package editor runs it on a converted font (19.7.1).
 */
export function checkFontFile(path: string, bytes: Buffer): ThemeFinding[] {
  const findings: ThemeFinding[] = [];
  if (bytes.length > THEME_LIMITS.fontBytes) {
    findings.push({ file: path, code: "font_too_large", detail: "larger than 2 MB" });
  }
  if (bytes.toString("latin1", 0, 4) !== "wOF2") {
    findings.push({ file: path, code: "font_not_woff2", detail: "not a WOFF2 font" });
  }
  return findings;
}

/** Checks a whole theme package. */
export function checkThemePackage(archive: Buffer): ThemeCheck {
  const findings: ThemeFinding[] = [];
  if (archive.length > THEME_LIMITS.archiveBytes) {
    return {
      ok: false,
      findings: [{ file: "(archive)", code: "archive_too_large", detail: "larger than 10 MB" }],
    };
  }
  let entries;
  try {
    entries = readPackageArchive(archive, { unpackedBytes: THEME_LIMITS.unpackedBytes });
  } catch (error) {
    if (error instanceof TarError) {
      return {
        ok: false,
        findings: [{ file: error.file, code: error.code, detail: error.message }],
      };
    }
    throw error;
  }
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (entry.kind === "directory") {
      if (!FOLDERS.includes(entry.path)) {
        findings.push({
          file: entry.path,
          code: "file_not_in_layout",
          detail: "not part of the layout",
        });
      }
      continue;
    }
    if (!inLayout(entry.path)) {
      findings.push({
        file: entry.path,
        code: "file_not_in_layout",
        detail: "not part of the layout",
      });
      continue;
    }
    files.set(entry.path, entry.data);
  }

  // manifest.json: the kind and the format version first, so an unknown version gets its own finding.
  const rawManifest = readJson("manifest.json", files, findings);
  let manifest: ThemeManifest | undefined;
  if (rawManifest !== undefined) {
    const version =
      typeof rawManifest === "object" && rawManifest !== null && "formatVersion" in rawManifest
        ? rawManifest.formatVersion
        : undefined;
    if (version !== undefined && !THEME_FORMAT_VERSIONS.some((known) => known === version)) {
      findings.push({
        file: "manifest.json",
        code: "format_version",
        detail: `format version ${JSON.stringify(version)} is not read by the platform`,
      });
    } else {
      const parsed = themeManifestSchema.safeParse(rawManifest);
      if (parsed.success) manifest = parsed.data;
      else
        findings.push({
          file: "manifest.json",
          code: "json_field",
          detail: fieldDetail(parsed.error),
        });
    }
  }

  // theme.json: the fields of format version 1, exactly.
  const rawTheme = readJson("theme.json", files, findings);
  let theme: ThemeJson | undefined;
  if (rawTheme !== undefined) {
    const parsed = themeJsonSchema.safeParse(rawTheme);
    if (parsed.success) theme = parsed.data;
    else
      findings.push({ file: "theme.json", code: "json_field", detail: fieldDetail(parsed.error) });
  }

  // Icons: present, PNG, and exactly their size.
  for (const [name, size] of [...REQUIRED_ICONS, ...OPTIONAL_ICONS]) {
    const bytes = files.get(name);
    if (bytes === undefined) {
      if (REQUIRED_ICONS.some(([required]) => required === name)) {
        findings.push({ file: name, code: "file_missing", detail: "the icon is missing" });
      }
      continue;
    }
    const png = pngSize(bytes);
    if (png === undefined) {
      findings.push({ file: name, code: "icon_not_png", detail: "not a PNG image" });
    } else if (png.width !== size || png.height !== size) {
      findings.push({
        file: name,
        code: "icon_size",
        detail: `${String(png.width)} × ${String(png.height)} instead of ${String(size)} × ${String(size)}`,
      });
    }
  }

  // Fonts: each file WOFF2 and at most 2 MB, at most eight, each named in theme.json and each named.
  const fontFiles = [...files.keys()].filter((path) => path.startsWith("fonts/"));
  const referenced = new Set<string>();
  for (const font of Object.values(theme?.fonts ?? {})) {
    for (const file of font.files) referenced.add(`fonts/${file.file}`);
  }
  if (fontFiles.length > THEME_LIMITS.fontCount) {
    findings.push({
      file: "fonts",
      code: "font_count",
      detail: `${String(fontFiles.length)} files instead of at most 8`,
    });
  }
  for (const path of fontFiles) {
    findings.push(...checkFontFile(path, files.get(path) ?? Buffer.alloc(0)));
    if (theme !== undefined && !referenced.has(path)) {
      findings.push({
        file: path,
        code: "font_unreferenced",
        detail: "theme.json does not name the file",
      });
    }
  }
  if (theme !== undefined) {
    for (const path of referenced) {
      if (!files.has(path))
        findings.push({ file: path, code: "font_missing", detail: "the font file is missing" });
    }
  }

  // Contrast (shared with the theme package editor): the text on the background, the surface and the
  // accent, and with a waiting card its text on the card and the button text on the button.
  if (theme !== undefined) {
    for (const check of themeContrastChecks(theme)) {
      if (!check.ok) {
        findings.push({
          file: "theme.json",
          code: "contrast",
          detail: `«${check.foreground}» on «${check.background}»: ${check.ratio.toFixed(1)} : 1 (at least 4.5 : 1)`,
        });
      }
    }
  }

  if (findings.length > 0 || manifest === undefined || theme === undefined) {
    return { ok: false, findings };
  }
  return { ok: true, package: { manifest, theme, files } };
}
