// The draft as the app reads a theme (`SiteTheme`, 19.7): the preview applies it with the app's own
// `themeStyle()` and `fontFaceRules()` (19.7.1, THM-11). A colour that is not yet a full `#rrggbb`
// while it is typed keeps the platform's colour, so the preview does not flicker or break.
import { THEME_COLOR_KEYS, WAITING_COLOR_KEYS } from "@zappaloo/shared";
import type { SiteTheme } from "@zappaloo/shared";
import {
  DEFAULT_COLORS,
  DEFAULT_WAITING,
  FAMILY,
  FONT_SLOTS,
  HEX,
  validSizeAdjust,
} from "./model.ts";
import type { ThemeDraft } from "./model.ts";

type SiteFont = NonNullable<SiteTheme["fonts"]["body"]>;

const colour = (value: string, fallback: string) => (HEX.test(value) ? value : fallback);

/**
 * `urls` maps the id of a font file to the object URL of its WOFF2 bytes. A font without a valid
 * family, or none of whose files has a URL yet, is left out.
 */
export function draftToSiteTheme(draft: ThemeDraft, urls: ReadonlyMap<string, string>): SiteTheme {
  const fonts: SiteTheme["fonts"] = {};
  for (const slot of FONT_SLOTS) {
    const font = draft.fonts[slot];
    if (font === null || !FAMILY.test(font.family)) continue;
    const files = font.files.flatMap((file) => {
      const url = urls.get(file.id);
      return url === undefined ? [] : [{ url, weight: file.weight, style: file.style }];
    });
    // a size adjust that the package would refuse is left out, so the preview does not break while typing
    const sizeAdjust = validSizeAdjust(font.sizeAdjust) ? { sizeAdjust: font.sizeAdjust } : {};
    if (files.length > 0)
      fonts[slot] = { family: font.family, ...sizeAdjust, files } satisfies SiteFont;
  }
  const theme: SiteTheme = {
    version: "preview",
    colors: Object.fromEntries(
      THEME_COLOR_KEYS.map((key) => [key, colour(draft.colors[key], DEFAULT_COLORS[key])]),
    ) as SiteTheme["colors"],
    fonts,
  };
  if (draft.waitingEnabled) {
    theme.waiting = Object.fromEntries(
      WAITING_COLOR_KEYS.map((key) => [key, colour(draft.waiting[key], DEFAULT_WAITING[key])]),
    ) as NonNullable<SiteTheme["waiting"]>;
  }
  return theme;
}
