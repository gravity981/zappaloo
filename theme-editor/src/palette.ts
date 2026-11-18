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

interface Oklch {
  /** Lightness 0–1. */
  l: number;
  /** Chroma, about 0–0.37 for colours that a screen can show. */
  c: number;
  /** Hue in degrees. */
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A `#rrggbb` colour as OKLCH. */
export function toOklch(hex: string): Oklch {
  const [r, g, b] = rgbOf(hex).map((v) => toLinear(v / 255)) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(a, bb);
  const hue = chroma < 1e-4 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l: lightness, c: chroma, h: hue };
}

function linearRgb({ l, c, h }: Oklch): [number, number, number] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: [number, number, number]) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** An OKLCH colour as `#rrggbb`; a colour that a screen cannot show loses chroma until it can. */
export function fromOklch(color: Oklch): string {
  let { c } = color;
  let rgb = linearRgb({ ...color, c });
  if (!inGamut(rgb)) {
    let low = 0;
    let high = c;
    for (let i = 0; i < 20; i += 1) {
      const mid = (low + high) / 2;
      if (inGamut(linearRgb({ ...color, c: mid }))) low = mid;
      else high = mid;
    }
    c = low;
    rgb = linearRgb({ ...color, c });
  }
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

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
