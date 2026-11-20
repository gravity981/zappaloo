// The bar over the top of the game (GAME-14): its stylesheet, read as text like the safe-area rules of standalone.test.tsx.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...path: string[]) =>
  readFileSync(join(import.meta.dirname, ...path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const styles = read("../app/styles.css");
/** The declarations of every rule that names the selector, in order. */
const rule = (css: string, selector: string): string => {
  const found = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter((match) =>
      (match[1] ?? "")
        .split(",")
        .map((part) => part.trim())
        .includes(selector),
    )
    .map((match) => match[2] ?? "");
  if (found.length === 0) throw new Error(`no rule for ${selector}`);
  return found.join("\n");
};

describe("the bar floats over the game (GAME-14)", () => {
  it("[GAME-14] lies over the game window, takes no taps itself, and only Webseite does", () => {
    const bar = rule(styles, ".game-bar");
    expect(bar).toContain("position: absolute");
    expect(bar).toContain("pointer-events: none");
    expect(rule(styles, ".game-bar .game-bar-web")).toContain("pointer-events: auto");
    expect(rule(styles, ".game-window.guest")).toContain("position: relative");
  });

  it("[GAME-14] the name and Webseite are translucent rounded rectangles, Webseite with a white border", () => {
    const name = rule(styles, ".game-bar .game-bar-name");
    const web = rule(styles, ".game-bar .game-bar-web");
    for (const box of [name, web]) {
      expect(box).toContain("border-radius: 12px");
      expect(box).toContain("rgba(18, 18, 18, 0.45)");
    }
    expect(web).toContain("border: 1.5px solid #fff");
    expect(name).not.toContain("border:");
  });

  it("[GAME-14] stays above every layer the engine puts over the canvas, the start screen included", () => {
    const engine = [
      "start-screen",
      "loading-overlay",
      "bubble-layer",
      "edge-indicators",
      "object-label-layer",
    ];
    const layers = engine.flatMap((file) => {
      const source = readFileSync(
        join(import.meta.dirname, "../../../game-engine/src", `${file}.ts`),
        "utf8",
      );
      return [...source.matchAll(/z-index:(\d+)/g)].map((match) => Number(match[1]));
    });
    expect(layers.length).toBeGreaterThanOrEqual(engine.length);
    const z = /z-index: (\d+)/.exec(rule(styles, ".game-bar"));
    expect(Number(z?.[1])).toBeGreaterThan(Math.max(...layers));
  });

  it("[GAME-14] the name is trimmed to its capital letters where the browser can, so it is centred on an iPhone", () => {
    expect(styles).toMatch(
      /@supports \(text-box: trim-both cap alphabetic\) \{\s*\.game-bar \.game-bar-name b > span \{[^}]*text-box: trim-both cap alphabetic/,
    );
  });

  it("[GAME-14][GAME-26] the game tells the engine the height of the bar, so indicators, labels and bubbles stay below it", () => {
    const canvas = read("GameCanvas.tsx");
    expect(canvas).toMatch(/topInset: \(\) =>/);
    expect(canvas).toContain(".game-bar");
  });
});
