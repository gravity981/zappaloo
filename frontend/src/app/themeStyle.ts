// The custom properties and font faces of the event's theme (sw-architecture.md 19.7, THM-06): what
// the wrapper of the website and the guest pages sets, computed from `GET /api/site`.
import type { CSSProperties } from "react";
import { contrastRatio, fromOklch, THEME_LIMITS, toOklch } from "@zappaloo/shared";
import type { SiteTheme, ThemeColorKey } from "@zappaloo/shared";

/**
 * The fill that the theme gives to soft buttons, chips, tags and the bars (19.7, THM-17). The theme has
 * no colour of its own for it, so it is derived: the hue of the accent, a moderate chroma, and a
 * lightness a little off the surface (darker for dark text, lighter for light text). A plain mix of
 * the accent with the surface would only darken it to a grey. The step is lowered until the text on
 * the fill still reaches the contrast of the validator, and is 0 (the surface) at the end.
 */
export function themeFill(colors: SiteTheme["colors"]): string {
  const accent = toOklch(colors.accent);
  const surface = toOklch(colors.surface);
  const direction = toOklch(colors.text).l <= surface.l ? -1 : 1;
  const chroma = Math.min(accent.c * FILL_CHROMA_SHARE, FILL_CHROMA_MAX);
  for (let step = FILL_STEP; step > 0.005; step -= 0.01) {
    const fill = fromOklch({
      l: Math.min(1, Math.max(0, surface.l + direction * step)),
      c: chroma,
      h: accent.h,
    });
    if (contrastRatio(colors.text, fill) >= THEME_LIMITS.contrast) return fill;
  }
  return colors.surface;
}

/** How far the fill's lightness lies off the surface's, at most; the share and cap of the accent's chroma. */
const FILL_STEP = 0.08;
const FILL_CHROMA_SHARE = 0.4;
const FILL_CHROMA_MAX = 0.07;

/** The token each theme colour sets (ui.css). Status colours stay the platform's (19.7). */
const COLOR_TOKENS: Record<ThemeColorKey, string> = {
  background: "--a-bg",
  surface: "--a-card",
  text: "--a-ink",
  muted: "--a-muted",
  line: "--a-line",
  accent: "--a-dark",
  onAccent: "--a-on-dark",
};

/** A font stack: the family, then the platform's fallback. */
function stack(family: string): string {
  return `"${family}", system-ui, sans-serif`;
}

/**
 * The custom properties of the theme. A font the theme leaves out keeps the default of ui.css:
 * without a body font the platform's; without a heading font the platform's; without a display
 * font the countdown uses the heading font (`--a-number-font` falls back to `--a-display`).
 */
export function themeStyle(theme: SiteTheme | null): CSSProperties {
  if (theme === null) return {};
  const style: Record<string, string> = {};
  for (const key of Object.keys(COLOR_TOKENS) as ThemeColorKey[]) {
    style[COLOR_TOKENS[key]] = theme.colors[key];
  }
  if (theme.fonts.body) style["--a-body-font"] = stack(theme.fonts.body.family);
  if (theme.fonts.heading) style["--a-display"] = stack(theme.fonts.heading.family);
  if (theme.fonts.display) style["--a-number-font"] = stack(theme.fonts.display.family);
  // The waiting card has its own colours (19.7); waiting.css falls back to the platform's.
  if (theme.waiting) {
    style["--w-card"] = theme.waiting.card;
    style["--w-text"] = theme.waiting.text;
    style["--w-button"] = theme.waiting.button;
    style["--w-on-button"] = theme.waiting.onButton;
  }
  // THM-17: soft buttons, chips and tags take the tint of the accent; the bars of the website and the
  // game take it too, with the surface for the active tab so that it stands out from the bar.
  const fill = themeFill(theme.colors);
  style["--a-fill"] = fill;
  style["--a-bar"] = fill;
  style["--a-bar-pill"] = theme.colors.surface;
  return style;
}

/** The `@font-face` rules of every font file of the theme, with the URLs `GET /api/site` gives. */
export function fontFaceRules(theme: SiteTheme | null): string {
  if (theme === null) return "";
  const faces = [theme.fonts.body, theme.fonts.heading, theme.fonts.display].flatMap((font) =>
    font
      ? font.files.map((file) => ({ family: font.family, sizeAdjust: font.sizeAdjust, ...file }))
      : [],
  );
  return faces
    .map(
      (face) =>
        `@font-face { font-family: "${face.family}"; src: url("${face.url}") format("woff2"); ` +
        `font-weight: ${String(face.weight)}; font-style: ${face.style}; ` +
        // THM-16: only the imported font is scaled; 100 percent is the font as it is
        (face.sizeAdjust === undefined || face.sizeAdjust === 100
          ? ""
          : `size-adjust: ${String(face.sizeAdjust)}%; `) +
        `font-display: swap; }`,
    )
    .join("\n");
}
