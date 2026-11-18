// Builds a theme package from the editor's data and opens one again, with the platform's own code
// (19.7.1, THM-12, THM-13): `backend/src/theme/build.ts` writes the archive and `validate.ts` checks
// it. A package the validator refuses is not built, and one it refuses is not opened.
import { buildThemeArchive } from "../../../backend/src/theme/build.ts";
import { checkThemePackage } from "../../../backend/src/theme/validate.ts";
import type { ThemeFinding } from "../../../backend/src/theme/validate.ts";
import { ICONS } from "../icons.ts";
import { FONT_SLOTS } from "../model.ts";
import type { PackageData } from "../transfer.ts";
import { slugOf } from "../transfer.ts";

export type BuildResult =
  { ok: true; archive: Buffer; fileName: string } | { ok: false; findings: ThemeFinding[] };

export type OpenResult = { ok: true; data: PackageData } | { ok: false; findings: ThemeFinding[] };

const bytes = (base64: string) => Buffer.from(base64, "base64");

/**
 * The archive of the package. The fields are written as the editor has them: what is wrong (an empty
 * name, a colour that is no #rrggbb, a font without files, a missing icon, too little contrast) is
 * found by the validator, which has the last word, so the editor has no rules of its own to keep.
 */
export function buildPackage(data: PackageData): BuildResult {
  const files: Record<string, Buffer> = {
    "manifest.json": Buffer.from(
      `${JSON.stringify({ kind: "zappaloo-theme", formatVersion: 1, name: data.name }, null, 2)}\n`,
    ),
  };
  const fonts: Record<string, { family: string; files: unknown[] }> = {};
  for (const slot of FONT_SLOTS) {
    const font = data.fonts[slot];
    if (font === null) continue;
    fonts[slot] = {
      family: font.family,
      files: font.files.map((file) => ({
        file: file.fileName,
        weight: file.weight,
        style: file.style,
      })),
    };
    for (const file of font.files) files[`fonts/${file.fileName}`] = bytes(file.woff2);
  }
  const theme = {
    colors: data.colors,
    ...(Object.keys(fonts).length > 0 ? { fonts } : {}),
    ...(data.waiting === null ? {} : { waiting: data.waiting }),
  };
  files["theme.json"] = Buffer.from(`${JSON.stringify(theme, null, 2)}\n`);
  for (const icon of ICONS) {
    const png = data.icons[icon.name];
    if (png !== undefined) files[icon.path] = bytes(png);
  }

  const archive = buildThemeArchive(files);
  const checked = checkThemePackage(archive);
  if (!checked.ok) return { ok: false, findings: checked.findings };
  return { ok: true, archive, fileName: `${slugOf(data.name)}.tar.gz` };
}

/** Validates an archive and reads its fields, fonts and icons back into the editor's data. */
export function openPackage(archive: Buffer): OpenResult {
  const checked = checkThemePackage(archive);
  if (!checked.ok) return { ok: false, findings: checked.findings };
  const { manifest, theme, files } = checked.package;
  const fonts: PackageData["fonts"] = { body: null, heading: null, display: null };
  for (const slot of FONT_SLOTS) {
    const font = theme.fonts?.[slot];
    if (font === undefined) continue;
    fonts[slot] = {
      family: font.family,
      files: font.files.map((file) => ({
        fileName: file.file,
        weight: file.weight,
        style: file.style,
        woff2: (files.get(`fonts/${file.file}`) ?? Buffer.alloc(0)).toString("base64"),
      })),
    };
  }
  const icons: PackageData["icons"] = {};
  for (const icon of ICONS) {
    const png = files.get(icon.path);
    if (png !== undefined) icons[icon.name] = png.toString("base64");
  }
  return {
    ok: true,
    data: {
      name: manifest.name,
      colors: theme.colors,
      waiting: theme.waiting ?? null,
      fonts,
      icons,
    },
  };
}
