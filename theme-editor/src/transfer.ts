// What the browser and the development server exchange about a theme package (19.7.1): the same
// shape for «Export» (to the server) and «Open» (from the server), so a package that is exported and
// opened again comes back unchanged. Binary files travel as base64.
import type { ThemeJson } from "@zappaloo/shared";
import type { FontSlot } from "./model.ts";

export interface PackageFontFile {
  /** The name in `fonts/`. */
  fileName: string;
  weight: number;
  style: "normal" | "italic";
  /** The WOFF2 bytes, base64. */
  woff2: string;
}

export interface PackageData {
  /** The manifest's `name`. */
  name: string;
  colors: ThemeJson["colors"];
  /** `null` is no `waiting` entry. */
  waiting: NonNullable<ThemeJson["waiting"]> | null;
  fonts: Record<FontSlot, { family: string; sizeAdjust: number; files: PackageFontFile[] } | null>;
  /** PNG bytes (base64) by icon name (`icon-192`); an icon that is not there has no key. */
  icons: Record<string, string>;
}

/** One finding of the validator, as the server gives it. */
export interface PackageFinding {
  file: string;
  code: string;
  detail: string;
}

export type CardName = "Package" | "Name" | "Colours" | "Waiting card" | "Fonts" | "Icons";

/** The card of the editor that a finding belongs to, for the list of findings (THM-12, THM-13). */
export function findingCard(finding: PackageFinding): CardName {
  const { file, detail } = finding;
  if (file === "manifest.json") return "Name";
  if (file.startsWith("icons/")) return "Icons";
  if (file === "fonts" || file.startsWith("fonts/")) return "Fonts";
  if (file === "theme.json") {
    if (/^fonts[.:]|^fonts\b/.test(detail)) return "Fonts";
    if (/^waiting\b|waiting (card|button)/.test(detail)) return "Waiting card";
    return "Colours";
  }
  return "Package";
}

/** The slug of the name for the file name of the download: `Sommerfest 2027!` → `sommerfest-2027`. */
export function slugOf(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? "theme" : slug;
}
