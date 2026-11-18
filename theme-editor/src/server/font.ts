// A font file for the theme package: WOFF2, OTF and TTF are accepted, OTF and TTF are converted to
// WOFF2 with Google's encoder (woff2-encoder, WebAssembly), because the package holds WOFF2 only
// (sw-architecture.md 19.7.1, THM-09). The family, weight and style are suggested from the file. The
// converted file goes through the validator's own font check.
import path from "node:path";
import * as fontkit from "fontkit";
import { compress } from "woff2-encoder";
import { checkFontFile } from "../../../backend/src/theme/validate.ts";
import type { ThemeFinding } from "../../../backend/src/theme/validate.ts";

export interface PreparedFont {
  /** The name of the file in `fonts/`, from the name of the uploaded file. */
  fileName: string;
  woff2: Buffer;
  /** True when the file was OTF or TTF and has been converted. */
  converted: boolean;
  suggestion: { family: string; weight: number; style: "normal" | "italic" };
}

/** A file the editor cannot use, with the findings that say why. */
export class FontRefused extends Error {
  readonly findings: ThemeFinding[];
  constructor(file: string, detail: string, code = "font_not_woff2", findings?: ThemeFinding[]) {
    super(detail);
    this.findings = findings ?? [{ file, code: code as ThemeFinding["code"], detail }];
  }
}

type FontKind = "woff2" | "sfnt" | "woff" | "collection" | "unknown";

function kindOf(bytes: Uint8Array): FontKind {
  const tag = Buffer.from(bytes.subarray(0, 4)).toString("latin1");
  if (tag === "wOF2") return "woff2";
  if (tag === "wOFF") return "woff";
  if (tag === "ttcf") return "collection";
  if (tag === "OTTO" || tag === "true" || tag === "\u0000\u0001\u0000\u0000") return "sfnt";
  return "unknown";
}

/** The name of the file in `fonts/` (19.7): `[A-Za-z0-9][A-Za-z0-9._-]*.woff2`. */
export function woff2FileName(uploaded: string): string {
  const base = path
    .basename(uploaded.replaceAll("\\", "/"))
    .replace(/\.[A-Za-z0-9]+$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 70);
  return `${base === "" ? "font" : base}.woff2`;
}

/** The family as the package allows it: letters, digits, spaces and hyphens, 1–40 characters. */
function familyOf(font: fontkit.Font): string {
  const records = font.name?.records;
  const preferred = records?.preferredFamily?.en ?? records?.fontFamily?.en ?? font.familyName;
  const cleaned = preferred
    .replace(/[^\p{L}\p{N} -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return cleaned === "" ? "Font" : cleaned;
}

function suggestionOf(font: fontkit.Font): PreparedFont["suggestion"] {
  const raw = font["OS/2"]?.usWeightClass ?? 400;
  const weight = Math.min(900, Math.max(100, Math.round(raw / 100) * 100));
  const records = font.name?.records;
  const subfamily = records?.preferredSubfamily?.en ?? font.subfamilyName;
  const italic = font.italicAngle !== 0 || /italic|oblique/i.test(subfamily);
  return { family: familyOf(font), weight, style: italic ? "italic" : "normal" };
}

/** Reads an uploaded font file, converts it when needed and checks the result. */
export async function prepareFont(uploadedName: string, bytes: Uint8Array): Promise<PreparedFont> {
  const fileName = woff2FileName(uploadedName);
  const file = `fonts/${fileName}`;
  const kind = kindOf(bytes);
  if (kind === "woff") {
    throw new FontRefused(file, "WOFF 1 is not accepted; use WOFF2, OTF or TTF");
  }
  if (kind === "collection") {
    throw new FontRefused(file, "font collections (TTC) are not accepted; use one font per file");
  }
  if (kind === "unknown") {
    throw new FontRefused(file, "not a font file; use WOFF2, OTF or TTF");
  }

  let font: fontkit.Font;
  try {
    font = fontkit.create(bytes);
  } catch {
    throw new FontRefused(file, "the font file cannot be read");
  }

  const converted = kind === "sfnt";
  let woff2: Buffer;
  if (converted) {
    try {
      woff2 = Buffer.from(await compress(bytes));
    } catch {
      throw new FontRefused(file, "the font cannot be converted to WOFF2");
    }
  } else {
    woff2 = Buffer.from(bytes);
  }

  const findings = checkFontFile(file, woff2);
  if (findings.length > 0)
    throw new FontRefused(file, findings[0]?.detail ?? "", undefined, findings);
  return { fileName, woff2, converted, suggestion: suggestionOf(font) };
}
