// The contrast of two colours as WCAG defines it (19.7: text on background, text on surface, and
// the text on the accent must reach 4.5 : 1).
import { THEME_LIMITS } from "./theme.ts";

/** The channels of a `#rrggbb` colour, 0–255. */
export function rgbOf(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** The relative luminance of a colour (0 black, 1 white). */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The contrast ratio of two colours, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

/** One pair of colours of a theme that must reach the contrast of the validator (19.7, THM-03). */
export interface ContrastCheck {
  /** The names as the findings and the theme package editor show them. */
  foreground: string;
  background: string;
  foregroundColor: string;
  backgroundColor: string;
  ratio: number;
  ok: boolean;
}

/** The colours the contrast checks read: `ThemeJson` without its other fields, or a draft of it. */
export interface ContrastColors {
  colors: Record<"text" | "background" | "surface" | "onAccent" | "accent", string>;
  waiting?: Record<"card" | "text" | "button" | "onButton", string> | undefined;
}

/**
 * The pairs the validator checks (19.7): the text on the background, on the surface and the text on
 * the accent; with a waiting card its text on the card and the button text on the button. The
 * validator and the theme package editor (19.7.1) both read this list, so they cannot disagree.
 */
export function themeContrastChecks(theme: ContrastColors): ContrastCheck[] {
  const { colors, waiting } = theme;
  const pairs: [string, string, string, string][] = [
    ["text", colors.text, "background", colors.background],
    ["text", colors.text, "surface", colors.surface],
    ["onAccent", colors.onAccent, "accent", colors.accent],
    ...(waiting === undefined
      ? []
      : ([
          ["text", waiting.text, "waiting card", waiting.card],
          ["onButton", waiting.onButton, "waiting button", waiting.button],
        ] satisfies [string, string, string, string][])),
  ];
  return pairs.map(([foreground, foregroundColor, background, backgroundColor]) => {
    const ratio = contrastRatio(foregroundColor, backgroundColor);
    return {
      foreground,
      background,
      foregroundColor,
      backgroundColor,
      ratio,
      ok: ratio >= THEME_LIMITS.contrast,
    };
  });
}
