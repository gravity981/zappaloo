import { afterEach, describe, expect, it } from "vitest";
import { accentColorAt, parseHexColor } from "./silhouette-color.ts";

describe("the colour of the silhouettes (GAME-42)", () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it("[GAME-42] reads a hexadecimal colour, short or long, and nothing else", () => {
    expect(parseHexColor("#2a2a28")).toBe(0x2a2a28);
    expect(parseHexColor(" #fa0 ")).toBe(0xffaa00);
    expect(parseHexColor("rgb(1, 2, 3)")).toBeUndefined();
    expect(parseHexColor("")).toBeUndefined();
  });

  it("[GAME-42] takes the accent colour the theme sets around the game", () => {
    const wrapper = document.createElement("div");
    wrapper.style.setProperty("--a-dark", "#123456");
    const game = document.createElement("div");
    wrapper.append(game);
    document.body.append(wrapper);
    expect(accentColorAt(game)).toBe(0x123456);
    expect(accentColorAt(document.body)).toBeUndefined();
  });
});
