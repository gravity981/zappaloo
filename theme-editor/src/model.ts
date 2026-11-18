// The draft of a theme in the editor (sw-architecture.md 19.7.1): what the controls change. The
// fields mirror `theme.json` and `manifest.json`; the font files are kept as WOFF2 bytes.
import {
  THEME_COLOR_KEYS,
  THEME_LIMITS,
  WAITING_COLOR_KEYS,
  themeContrastChecks,
} from "@zappaloo/shared";
import type { ContrastCheck, ThemeColorKey, WaitingColorKey } from "@zappaloo/shared";

export type FontSlot = "body" | "heading" | "display";
export const FONT_SLOTS: readonly FontSlot[] = ["body", "heading", "display"];

export interface DraftFontFile {
  /** Local id, for React keys. */
  id: string;
  /** The name in `fonts/` (the WOFF2 name of the uploaded file). */
  fileName: string;
  weight: number;
  style: "normal" | "italic";
  /** The size after conversion, in bytes. */
  size: number;
  converted: boolean;
  woff2: Uint8Array;
}

export interface DraftFont {
  family: string;
  files: DraftFontFile[];
}

export interface ThemeDraft {
  name: string;
  colors: Record<ThemeColorKey, string>;
  /** Off: no `waiting` entry in the package. */
  waitingEnabled: boolean;
  waiting: Record<WaitingColorKey, string>;
  fonts: Record<FontSlot, DraftFont | null>;
}

/** The platform's default colours (ui.css, waiting.css): "New theme" starts from them. */
export const DEFAULT_COLORS: Record<ThemeColorKey, string> = {
  background: "#f4f4f1",
  surface: "#ffffff",
  text: "#1f1f1d",
  muted: "#6a6a64",
  line: "#d5d5ce",
  accent: "#2a2a28",
  onAccent: "#ffffff",
};
export const DEFAULT_WAITING: Record<WaitingColorKey, string> = {
  card: "#fffaf0",
  text: "#2a2420",
  button: "#2a2420",
  onButton: "#ffffff",
};

export function newDraft(): ThemeDraft {
  return {
    name: "",
    colors: { ...DEFAULT_COLORS },
    waitingEnabled: false,
    waiting: { ...DEFAULT_WAITING },
    fonts: { body: null, heading: null, display: null },
  };
}

export const HEX = /^#[0-9a-fA-F]{6}$/;

/** Every colour the draft sets, with its name, for the controls and the checks. */
export function allColors(draft: ThemeDraft): string[] {
  return [
    ...THEME_COLOR_KEYS.map((key) => draft.colors[key]),
    ...(draft.waitingEnabled ? WAITING_COLOR_KEYS.map((key) => draft.waiting[key]) : []),
  ];
}

/**
 * The contrast pairs of the validator for the draft, as the same function of `shared` gives them. A
 * colour that is not yet a full `#rrggbb` while typing leaves the check out.
 */
export function contrastChecks(draft: ThemeDraft): ContrastCheck[] {
  if (!allColors(draft).every((color) => HEX.test(color))) return [];
  return themeContrastChecks({
    colors: draft.colors,
    waiting: draft.waitingEnabled ? draft.waiting : undefined,
  });
}

export function fontFileCount(draft: ThemeDraft): number {
  return FONT_SLOTS.reduce((sum, slot) => sum + (draft.fonts[slot]?.files.length ?? 0), 0);
}

/** How many more files fit: 4 per font and 8 in all (19.7). */
export function roomForFiles(draft: ThemeDraft, slot: FontSlot): number {
  const own = draft.fonts[slot]?.files.length ?? 0;
  return Math.max(0, Math.min(4 - own, THEME_LIMITS.fontCount - fontFileCount(draft)));
}

/** The family as the package accepts it (19.7): letters, digits, spaces and hyphens, 1–40 characters. */
export const FAMILY = /^[\p{L}\p{N} -]{1,40}$/u;

/** The name of a file in `fonts/` that no other file of the draft has: `lora.woff2`, `lora-2.woff2`. */
export function uniqueFileName(draft: ThemeDraft, wanted: string): string {
  const taken = new Set(
    FONT_SLOTS.flatMap((slot) => draft.fonts[slot]?.files.map((file) => file.fileName) ?? []),
  );
  if (!taken.has(wanted)) return wanted;
  const stem = wanted.replace(/\.woff2$/, "");
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${String(n)}.woff2`;
    if (!taken.has(candidate)) return candidate;
  }
}
