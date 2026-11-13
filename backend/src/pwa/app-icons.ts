// The event's app icons and the web app manifest (PWA-01, PWA-02; sw-architecture.md 19.5, 19.7).
//
// The icons and the manifest colours come from the active theme package (19.7). Without a theme,
// or for an icon the theme does not carry (the maskable icon is optional), the built-in default
// is served. A file that is not a PNG of the exact size is replaced by the default too, so the
// install always works.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventResponse } from "@zappaloo/shared";
import type { ThemeService } from "../theme/service.ts";

/** The four icon files and the exact pixel size of each (19.5). */
export const ICON_FILES = {
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable-512.png": 512,
  "apple-touch-icon.png": 180,
} as const;

export type IconFile = keyof typeof ICON_FILES;
export const ICON_NAMES = Object.keys(ICON_FILES) as [IconFile, ...IconFile[]];

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), "default-icons");

/** The colours of the manifest while the default theme applies: the platform's own tokens (ui.css). */
export const MANIFEST_COLORS = { theme: "#2a2a28", background: "#f4f4f1" } as const;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** True if the bytes are a PNG whose header says exactly `size` × `size` pixels. */
export function isPngOfSize(bytes: Buffer, size: number): boolean {
  // Signature (8), IHDR length (4), "IHDR" (4), width (4), height (4).
  if (bytes.length < 24) return false;
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return false;
  if (bytes.toString("latin1", 12, 16) !== "IHDR") return false;
  return bytes.readUInt32BE(16) === size && bytes.readUInt32BE(20) === size;
}

/** The name under the icon: at most 12 characters (whole letters, never half an emoji). */
function shortName(name: string): string {
  const letters = Array.from(new Intl.Segmenter().segment(name), (part) => part.segment);
  return letters.slice(0, 12).join("").trim() || "Zappaloo";
}

export interface Icon {
  bytes: Buffer;
  /** True if the active theme's file is used, false for the built-in default. */
  custom: boolean;
  /** Changes with every theme import; the manifest asks for the icon with it. */
  version: string;
}

export class AppIcons {
  readonly #theme: ThemeService;

  constructor(theme: ThemeService) {
    this.#theme = theme;
  }

  /** The active theme's icon if it is a valid PNG of its size, otherwise the default. */
  icon(file: IconFile): Icon {
    const active = this.#theme.active();
    if (active !== undefined) {
      try {
        const bytes = readFileSync(join(this.#theme.directory, active.importId, "icons", file));
        if (isPngOfSize(bytes, ICON_FILES[file])) {
          return { bytes, custom: true, version: active.importId };
        }
      } catch {
        // Missing or unreadable: the default is used.
      }
    }
    return { bytes: readFileSync(join(DEFAULT_DIR, file)), custom: false, version: "default" };
  }

  /** The web app manifest of the event (PWA-01): name and icons from the event, colours from the theme. */
  manifest(event: EventResponse): Record<string, unknown> {
    const name = event.name ?? "Zappaloo";
    const colors = this.#theme.active()?.colors;
    const src = (file: IconFile) =>
      `/app-icons/${file}?v=${encodeURIComponent(this.icon(file).version)}`;
    return {
      name,
      short_name: shortName(name),
      lang: event.defaultLanguage ?? "de",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: colors?.accent ?? MANIFEST_COLORS.theme,
      background_color: colors?.background ?? MANIFEST_COLORS.background,
      icons: [
        { src: src("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
        { src: src("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
        {
          src: src("icon-maskable-512.png"),
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    };
  }
}
