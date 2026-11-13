// The validator of the theme package (sw-architecture.md 19.7, THM-03). It checks the whole package
// and returns every finding with its file and reason; nothing is imported from here. A package with
// a finding is refused, and the active theme stays as it was.
import { z } from "zod";
import {
  THEME_FORMAT_VERSIONS,
  THEME_LIMITS,
  themeJsonSchema,
  themeManifestSchema,
} from "@zappaloo/shared";
import type { ThemeJson, ThemeManifest } from "@zappaloo/shared";
import { contrastRatio } from "./contrast.ts";
import { pngSize } from "./png.ts";
import { readThemeArchive, TarError } from "./tar.ts";

export type ThemeFindingCode =
  | "archive_too_large"
  | "unpacked_too_large"
  | "not_gzip"
  | "not_tar"
  | "entry_type"
  | "entry_path"
  | "entry_duplicate"
  | "file_not_in_layout"
  | "file_missing"
  | "json_invalid"
  | "json_field"
  | "format_version"
  | "icon_not_png"
  | "icon_size"
  | "font_not_woff2"
  | "font_too_large"
  | "font_count"
  | "font_unreferenced"
  | "font_missing"
  | "contrast";

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

/** The three icons every package has, and the optional maskable one (19.7). */
const REQUIRED_ICONS: [string, number][] = [
  ["icons/icon-192.png", 192],
  ["icons/icon-512.png", 512],
  ["icons/apple-touch-icon.png", 180],
];
const OPTIONAL_ICONS: [string, number][] = [["icons/icon-maskable-512.png", 512]];

const FONT_PATH = /^fonts\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.woff2$/;

/** The files of the layout: the two JSON files, the icons, and the fonts by their names. */
function inLayout(path: string): boolean {
  if (path === "manifest.json" || path === "theme.json") return true;
  if ([...REQUIRED_ICONS, ...OPTIONAL_ICONS].some(([name]) => name === path)) return true;
  return FONT_PATH.test(path);
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
    entries = readThemeArchive(archive, THEME_LIMITS.unpackedBytes);
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
      if (entry.path !== "icons" && entry.path !== "fonts") {
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
    const bytes = files.get(path) ?? Buffer.alloc(0);
    if (bytes.length > THEME_LIMITS.fontBytes) {
      findings.push({ file: path, code: "font_too_large", detail: "larger than 2 MB" });
    }
    if (bytes.toString("latin1", 0, 4) !== "wOF2") {
      findings.push({ file: path, code: "font_not_woff2", detail: "not a WOFF2 font" });
    }
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

  // Contrast: the text on the background, the text on the surface, and the text on the accent.
  if (theme !== undefined) {
    const { colors } = theme;
    const pairs = [
      ["text", colors.text, "background", colors.background],
      ["text", colors.text, "surface", colors.surface],
      ["onAccent", colors.onAccent, "accent", colors.accent],
    ] as const;
    for (const [fgName, fg, bgName, bg] of pairs) {
      const ratio = contrastRatio(fg, bg);
      if (ratio < THEME_LIMITS.contrast) {
        findings.push({
          file: "theme.json",
          code: "contrast",
          detail: `«${fgName}» on «${bgName}»: ${ratio.toFixed(1)} : 1 (at least 4.5 : 1)`,
        });
      }
    }
  }

  if (findings.length > 0 || manifest === undefined || theme === undefined) {
    return { ok: false, findings };
  }
  return { ok: true, package: { manifest, theme, files } };
}
