import { describe, expect, it } from "vitest";
import { contrastRatio, themeContrastChecks } from "./contrast.ts";

const colors = {
  background: "#f4f4f1",
  surface: "#ffffff",
  text: "#1f1f1d",
  onAccent: "#ffffff",
  accent: "#2a2a28",
};

describe("contrast of a theme (THM-03, THM-09)", () => {
  it("[THM-03] computes the WCAG ratio, from 1 to 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("[THM-03][THM-09] lists three pairs, and five with a waiting card, each against 4.5 : 1", () => {
    expect(themeContrastChecks({ colors }).map((c) => `${c.foreground}/${c.background}`)).toEqual([
      "text/background",
      "text/surface",
      "onAccent/accent",
    ]);
    const withWaiting = themeContrastChecks({
      colors,
      waiting: { card: "#fffaf0", text: "#2a2420", button: "#fffaf0", onButton: "#ffffff" },
    });
    expect(withWaiting).toHaveLength(5);
    expect(withWaiting.filter((check) => !check.ok).map((check) => check.background)).toEqual([
      "waiting button",
    ]);
  });
});
