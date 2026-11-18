// The colour assistant (sw-architecture.md 19.7.1, THM-15): from one master colour, the accent, it
// suggests complete palettes for the seven colours of `theme.json` and the four of the waiting card.
// The colours are derived in OKLCH, a colour space in which equal steps of lightness look equal, so a
// «light tint» of a yellow and of a blue are equally light. The contrast function is the validator's
// own (`shared`), and every text colour is darkened until the pairs reach 4.5 : 1, so a palette that
// is offered is one that the validator accepts.
import { THEME_LIMITS, contrastRatio, themeContrastChecks } from "@zappaloo/shared";
import type { ThemeColorKey, WaitingColorKey } from "@zappaloo/shared";

export interface Palette {
  id: string;
  name: string;
  description: string;
  colors: Record<ThemeColorKey, string>;
  waiting: Record<WaitingColorKey, string>;
}

export { fromOklch, toOklch } from "@zappaloo/shared";
import { fromOklch, toOklch } from "@zappaloo/shared";
import type { Oklch } from "@zappaloo/shared";

const MIN = THEME_LIMITS.contrast;

/**
 * A colour of the given hue and chroma, as light as `lightness` unless the colour is not readable on
 * all of `against` yet: then it is darkened step by step until it reaches the contrast.
 */
function readable(hue: number, chroma: number, lightness: number, against: string[]): string {
  for (let l = lightness; l > 0; l -= 0.01) {
    const hex = fromOklch({ l, c: chroma, h: hue });
    if (against.every((other) => contrastRatio(hex, other) >= MIN)) return hex;
  }
  return "#000000";
}

/** Black or white, whichever reaches more contrast on `background`: always at least 4.58 : 1. */
export function bestOnColor(background: string): "#000000" | "#ffffff" {
  return contrastRatio("#ffffff", background) >= contrastRatio("#000000", background)
    ? "#ffffff"
    : "#000000";
}

/** A random master colour that works as an accent: a clear hue, medium lightness. */
export function randomMaster(random: () => number = Math.random): string {
  return fromOklch({ l: 0.38 + random() * 0.17, c: 0.09 + random() * 0.08, h: random() * 360 });
}

interface Style {
  id: string;
  name: string;
  description: string;
  /** The hue of the waiting card for this style. */
  waitingHue: (master: Oklch) => number;
  colors: (
    master: Oklch,
    accent: string,
  ) => Omit<Record<ThemeColorKey, string>, "accent" | "onAccent">;
}

/** A tint of `hue`: its chroma follows the master colour, so a grey master gives grey tints. */
const tint = (master: Oklch, hue: number, l: number, share: number, cap: number) =>
  fromOklch({ l, c: Math.min(master.c * share, cap), h: hue });

const STYLES: Style[] = [
  {
    id: "tint",
    name: "Tint",
    description: "light tints of the master hue",
    waitingHue: (m) => m.h,
    colors: (m) => {
      const background = tint(m, m.h, 0.965, 0.22, 0.03);
      const surface = tint(m, m.h, 0.988, 0.12, 0.015);
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(m.h, Math.min(m.c * 0.3, 0.04), 0.24, against),
        muted: readable(m.h, Math.min(m.c * 0.4, 0.06), 0.5, against),
        line: tint(m, m.h, 0.875, 0.3, 0.04),
      };
    },
  },
  {
    id: "neutral",
    name: "Neutral",
    description: "grey tones",
    waitingHue: () => 95,
    colors: () => {
      const background = fromOklch({ l: 0.965, c: 0.003, h: 95 });
      const surface = "#ffffff";
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(95, 0.004, 0.25, against),
        muted: readable(95, 0.004, 0.5, against),
        line: fromOklch({ l: 0.88, c: 0.004, h: 95 }),
      };
    },
  },
  {
    id: "warm",
    name: "Warm paper",
    description: "cream tones",
    waitingHue: () => 60,
    colors: () => {
      const background = fromOklch({ l: 0.955, c: 0.022, h: 85 });
      const surface = fromOklch({ l: 0.985, c: 0.01, h: 85 });
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(85, 0.012, 0.26, against),
        muted: readable(85, 0.03, 0.5, against),
        line: fromOklch({ l: 0.885, c: 0.028, h: 85 }),
      };
    },
  },
  {
    id: "cool",
    name: "Cool",
    description: "blue-grey tones",
    waitingHue: () => 245,
    colors: () => {
      const background = fromOklch({ l: 0.958, c: 0.012, h: 240 });
      const surface = fromOklch({ l: 0.99, c: 0.005, h: 240 });
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(240, 0.015, 0.25, against),
        muted: readable(240, 0.025, 0.5, against),
        line: fromOklch({ l: 0.89, c: 0.015, h: 240 }),
      };
    },
  },
  {
    id: "complement",
    name: "Soft complement",
    description: "tints of the opposite hue",
    waitingHue: (m) => (m.h + 180) % 360,
    colors: (m) => {
      const hue = (m.h + 180) % 360;
      const background = tint(m, hue, 0.96, 0.22, 0.03);
      const surface = tint(m, hue, 0.988, 0.12, 0.015);
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(hue, Math.min(m.c * 0.25, 0.035), 0.24, against),
        muted: readable(hue, Math.min(m.c * 0.35, 0.05), 0.5, against),
        line: tint(m, hue, 0.875, 0.3, 0.04),
      };
    },
  },
  {
    id: "analogous",
    name: "Analogous",
    description: "tints of the neighbouring hues",
    waitingHue: (m) => (m.h + 30) % 360,
    colors: (m) => {
      const background = tint(m, (m.h + 30) % 360, 0.962, 0.24, 0.035);
      const surface = tint(m, m.h, 0.988, 0.12, 0.015);
      const against = [background, surface];
      return {
        background,
        surface,
        text: readable(m.h, Math.min(m.c * 0.3, 0.04), 0.24, against),
        muted: readable((m.h + 30) % 360, Math.min(m.c * 0.4, 0.06), 0.5, against),
        line: tint(m, (m.h + 330) % 360, 0.875, 0.3, 0.04),
      };
    },
  },
  {
    id: "contrast",
    name: "High contrast",
    description: "white and black",
    waitingHue: () => 0,
    colors: () => ({
      background: "#ffffff",
      surface: "#ffffff",
      text: "#000000",
      muted: readable(0, 0, 0.45, ["#ffffff"]),
      line: fromOklch({ l: 0.3, c: 0, h: 0 }),
    }),
  },
];

/** The waiting card of a palette: a deep card, white text, a light button with dark text. */
function waitingOf(master: Oklch, hue: number, highContrast: boolean): Palette["waiting"] {
  if (highContrast)
    return { card: "#000000", text: "#ffffff", button: "#ffffff", onButton: "#000000" };
  const chroma = Math.min(master.c * 0.6, 0.07);
  let card = fromOklch({ l: 0.27, c: chroma, h: hue });
  for (let l = 0.27; contrastRatio("#ffffff", card) < MIN && l > 0; l -= 0.01) {
    card = fromOklch({ l, c: chroma, h: hue });
  }
  const button = fromOklch({ l: 0.87, c: Math.min(master.c * 0.5, 0.1), h: hue });
  return { card, text: "#ffffff", button, onButton: readable(hue, 0.03, 0.22, [button]) };
}

/** The palettes that the colour assistant suggests for a master colour (`#rrggbb`), in order. */
export function suggestPalettes(master: string): Palette[] {
  const accent = master.toLowerCase();
  const m = toOklch(accent);
  return STYLES.map((style) => ({
    id: style.id,
    name: style.name,
    description: style.description,
    colors: { ...style.colors(m, accent), accent, onAccent: bestOnColor(accent) },
    waiting: waitingOf(m, style.waitingHue(m), style.id === "contrast"),
  }));
}

/** Whether every pair of the validator passes, and `muted` stays readable on the page and the cards. */
export function paletteIsReadable(palette: Palette): boolean {
  const { colors } = palette;
  return (
    themeContrastChecks({ colors, waiting: palette.waiting }).every((check) => check.ok) &&
    contrastRatio(colors.muted, colors.background) >= MIN &&
    contrastRatio(colors.muted, colors.surface) >= MIN
  );
}

/** Whether the seven colours of the draft are those of the palette (the card is then «picked»). */
export function paletteMatches(palette: Palette, colors: Record<ThemeColorKey, string>): boolean {
  return (Object.keys(palette.colors) as ThemeColorKey[]).every(
    (key) => palette.colors[key] === colors[key].toLowerCase(),
  );
}
