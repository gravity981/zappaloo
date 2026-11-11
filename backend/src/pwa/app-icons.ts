// The event's app icons and the web app manifest (PWA-01, PWA-02; sw-architecture.md 19.5).
//
// The icons are finished PNGs in `$DATA_DIR/events/<eventId>/icons/`; the platform does not
// resize images. A file that is missing, not a PNG, of the wrong size or too large is replaced
// by the built-in default, so the install always works.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventResponse } from "@zappaloo/shared";

/** The four icon files and the exact pixel size of each (19.5). */
export const ICON_FILES = {
  "icon-192.png": 192,
  "icon-512.png": 512,
  "icon-maskable-512.png": 512,
  "apple-touch-icon.png": 180,
} as const;

export type IconFile = keyof typeof ICON_FILES;
export const ICON_NAMES = Object.keys(ICON_FILES) as [IconFile, ...IconFile[]];

/** A bigger file is not an app icon; it is not read into memory either. */
const MAX_ICON_BYTES = 1024 * 1024;

const DEFAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), "default-icons");

/** The neutral colours of the manifest until `theme.json` sets them (stage 4). */
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
  /** True if the event's own file is used, false for the built-in default. */
  custom: boolean;
  /** Changes when the file is replaced; the manifest asks for the icon with it. */
  version: string;
}

export class AppIcons {
  readonly #eventsDir: string;

  constructor(eventsDir: string) {
    this.#eventsDir = eventsDir;
  }

  /** The event's icon if it is valid, otherwise the default. */
  icon(eventId: string, file: IconFile): Icon {
    const path = join(this.#eventsDir, eventId, "icons", file);
    try {
      if (existsSync(path)) {
        const stat = statSync(path);
        if (stat.isFile() && stat.size <= MAX_ICON_BYTES) {
          const bytes = readFileSync(path);
          if (isPngOfSize(bytes, ICON_FILES[file])) {
            return { bytes, custom: true, version: `${String(stat.mtimeMs)}-${String(stat.size)}` };
          }
        }
      }
    } catch {
      // Unreadable: the default is used.
    }
    return { bytes: readFileSync(join(DEFAULT_DIR, file)), custom: false, version: "default" };
  }

  /** The web app manifest of the event (PWA-01). */
  manifest(event: EventResponse): Record<string, unknown> {
    const name = event.name ?? "Zappaloo";
    const src = (file: IconFile) =>
      `/app-icons/${file}?v=${encodeURIComponent(this.icon(event.id, file).version)}`;
    return {
      name,
      short_name: shortName(name),
      lang: event.defaultLanguage ?? "de",
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: MANIFEST_COLORS.theme,
      background_color: MANIFEST_COLORS.background,
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
