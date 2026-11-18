// Colour maths in OKLCH, a colour space in which equal steps of lightness look equal (sw-architecture.md
// 19.7.1). The colour assistant of the theme package editor (THM-15) and the tint that the app derives
// from a theme's accent (THM-17) use it, so a «light tint» of a yellow and of a blue are equally light.

export interface Oklch {
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
