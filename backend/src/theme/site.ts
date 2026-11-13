// What the pages without sign-in apply of the active theme (sw-architecture.md 19.7): the colours,
// the font faces with their URLs, and a version that changes with every import. The font files
// are served only when the active theme names them (`fontFileNames`).
import type { SiteTheme, ThemeJson } from "@zappaloo/shared";
import type { ActiveTheme } from "./service.ts";

type Font = NonNullable<ThemeJson["fonts"]>[keyof NonNullable<ThemeJson["fonts"]>];

/** The site's theme, or null while the platform's default theme applies. */
export function siteTheme(active: ActiveTheme | undefined): SiteTheme | null {
  if (active === undefined) return null;
  const face = (font: Font | undefined) =>
    font === undefined
      ? undefined
      : {
          family: font.family,
          files: font.files.map((file) => ({
            url: fontUrl(file.file, active.importId),
            weight: file.weight,
            style: file.style,
          })),
        };
  const fonts = active.fonts ?? {};
  return {
    version: active.importId,
    colors: active.colors,
    fonts: { body: face(fonts.body), heading: face(fonts.heading), display: face(fonts.display) },
    waiting: active.waiting ?? undefined,
  };
}

/** The URL of a font file: under `/theme/fonts/`, versioned by the import. */
export function fontUrl(file: string, importId: string): string {
  return `/theme/fonts/${file}?v=${importId}`;
}

/** The names of the font files the active theme names (only these are served). */
export function fontFileNames(active: ActiveTheme | undefined): Set<string> {
  const names = new Set<string>();
  const fonts = active?.fonts ?? {};
  for (const font of [fonts.body, fonts.heading, fonts.display]) {
    for (const file of font?.files ?? []) names.add(file.file);
  }
  return names;
}
