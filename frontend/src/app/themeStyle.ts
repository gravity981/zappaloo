// The custom properties and font faces of the event's theme (sw-architecture.md 19.7, THM-06): what
// the wrapper of the website and the guest pages sets, computed from `GET /api/site`.
import type { CSSProperties } from "react";
import type { SiteTheme, ThemeColorKey } from "@zappaloo/shared";

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
  return style;
}

/** The `@font-face` rules of every font file of the theme, with the URLs `GET /api/site` gives. */
export function fontFaceRules(theme: SiteTheme | null): string {
  if (theme === null) return "";
  const faces = [theme.fonts.body, theme.fonts.heading, theme.fonts.display].flatMap((font) =>
    font ? font.files.map((file) => ({ family: font.family, ...file })) : [],
  );
  return faces
    .map(
      (face) =>
        `@font-face { font-family: "${face.family}"; src: url("${face.url}") format("woff2"); ` +
        `font-weight: ${String(face.weight)}; font-style: ${face.style}; font-display: swap; }`,
    )
    .join("\n");
}
