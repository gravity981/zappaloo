import { contrastRatio } from "@zappaloo/shared";
import { describe, expect, it } from "vitest";
import {
  bestOnColor,
  fromOklch,
  paletteIsReadable,
  paletteMatches,
  randomMaster,
  suggestPalettes,
  toOklch,
} from "./palette.ts";

const HEX = /^#[0-9a-f]{6}$/;

/** Master colours from black to white, grey to vivid, around the whole colour wheel. */
function masters(): string[] {
  const list = [
    "#000000",
    "#ffffff",
    "#808080",
    "#7a3b2e",
    "#ffd27a",
    "#0000ff",
    "#ff0000",
    "#00ff00",
  ];
  for (let h = 0; h < 360; h += 30) {
    for (const l of [0.2, 0.4, 0.6, 0.8, 0.95]) {
      for (const c of [0, 0.05, 0.12, 0.2]) list.push(fromOklch({ l, c, h }));
    }
  }
  return list;
}

describe("colour assistant: palettes from a master colour (THM-15)", () => {
  it("[THM-15] offers the seven palettes of the mock, in order", () => {
    expect(suggestPalettes("#7a3b2e").map((p) => p.name)).toEqual([
      "Tint",
      "Neutral",
      "Warm paper",
      "Cool",
      "Soft complement",
      "Analogous",
      "High contrast",
    ]);
  });

  it("[THM-15] every palette keeps the master as the accent and sets every key to a #rrggbb colour", () => {
    for (const master of masters()) {
      for (const palette of suggestPalettes(master)) {
        expect(palette.colors.accent, `${palette.name} of ${master}`).toBe(master);
        expect(Object.values(palette.colors).every((c) => HEX.test(c))).toBe(true);
        expect(Object.values(palette.waiting).every((c) => HEX.test(c))).toBe(true);
        expect(Object.keys(palette.colors).sort()).toEqual([
          "accent",
          "background",
          "line",
          "muted",
          "onAccent",
          "surface",
          "text",
        ]);
      }
    }
  });

  it("[THM-15] every palette of every master reaches the validator's contrast in every pair, and muted stays readable", () => {
    let checked = 0;
    for (const master of masters()) {
      for (const palette of suggestPalettes(master)) {
        expect(paletteIsReadable(palette), `${palette.name} of ${master}`).toBe(true);
        const { colors, waiting } = palette;
        expect(contrastRatio(colors.text, colors.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.text, colors.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(colors.onAccent, colors.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(waiting.text, waiting.card)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(waiting.onButton, waiting.button)).toBeGreaterThanOrEqual(4.5);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("[THM-15] onAccent is black or white, whichever reaches more contrast", () => {
    expect(bestOnColor("#7a3b2e")).toBe("#ffffff");
    expect(bestOnColor("#ffd27a")).toBe("#000000");
    expect(bestOnColor("#808080")).toBe("#000000");
    for (const master of masters()) {
      for (const { colors } of suggestPalettes(master)) {
        expect(colors.onAccent).toBe(bestOnColor(master));
      }
    }
  });

  it("[THM-15] the palettes differ from each other, and follow the master hue where their name says so", () => {
    const palettes = suggestPalettes("#7a3b2e");
    expect(new Set(palettes.map((p) => p.colors.background)).size).toBe(7);
    const hue = toOklch("#7a3b2e").h;
    const by = (id: string) => palettes.find((p) => p.id === id);
    const diff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
    expect(diff(toOklch(by("tint")?.colors.background ?? "").h, hue)).toBeLessThan(15);
    expect(diff(toOklch(by("complement")?.colors.background ?? "").h, hue + 180)).toBeLessThan(15);
    expect(diff(toOklch(by("analogous")?.colors.background ?? "").h, hue + 30)).toBeLessThan(15);
  });

  it("[THM-15] Neutral, Warm paper, Cool and High contrast do not depend on the master; a grey master gives grey tints", () => {
    const a = suggestPalettes("#7a3b2e");
    const b = suggestPalettes("#2f6b4f");
    for (const id of ["neutral", "warm", "cool", "contrast"]) {
      const x = a.find((p) => p.id === id);
      const y = b.find((p) => p.id === id);
      expect({ ...x?.colors, accent: "", onAccent: "" }).toEqual({
        ...y?.colors,
        accent: "",
        onAccent: "",
      });
    }
    const grey = suggestPalettes("#808080").find((p) => p.id === "tint");
    expect(toOklch(grey?.colors.background ?? "").c).toBeLessThan(0.005);
    const contrast = a.find((p) => p.id === "contrast");
    expect(contrast?.colors.text).toBe("#000000");
    expect(contrast?.colors.background).toBe("#ffffff");
  });

  it("[THM-15] colours convert to OKLCH and back without visible change", () => {
    expect(toOklch("#ffffff").l).toBeCloseTo(1, 2);
    expect(toOklch("#000000").l).toBeCloseTo(0, 2);
    for (const hex of ["#7a3b2e", "#2f6b4f", "#ffd27a", "#3366cc", "#f4f4f1"]) {
      const back = fromOklch(toOklch(hex));
      for (const i of [1, 3, 5]) {
        const delta = Math.abs(
          Number.parseInt(hex.slice(i, i + 2), 16) - Number.parseInt(back.slice(i, i + 2), 16),
        );
        expect(delta, `${hex} → ${back}`).toBeLessThanOrEqual(1);
      }
    }
    // a colour a screen cannot show is brought into the gamut, not wrapped around
    expect(fromOklch({ l: 0.9, c: 0.4, h: 150 })).toMatch(HEX);
  });

  it("[THM-15] a random master is a usable accent and follows the random numbers it is given", () => {
    expect(randomMaster(() => 0.5)).toMatch(HEX);
    expect(randomMaster(() => 0.1)).not.toBe(randomMaster(() => 0.9));
    for (let i = 0; i < 50; i += 1) {
      const master = randomMaster();
      expect(suggestPalettes(master).every(paletteIsReadable)).toBe(true);
    }
  });

  it("[THM-15] a palette is picked when the draft has its seven colours", () => {
    const [tint, neutral] = suggestPalettes("#7a3b2e");
    if (tint === undefined || neutral === undefined) throw new Error("no palettes");
    expect(paletteMatches(tint, tint.colors)).toBe(true);
    expect(paletteMatches(tint, { ...tint.colors, text: "#000000" })).toBe(false);
    expect(paletteMatches(tint, neutral.colors)).toBe(false);
    expect(paletteMatches(tint, { ...tint.colors, accent: tint.colors.accent.toUpperCase() })).toBe(
      true,
    );
  });
});
