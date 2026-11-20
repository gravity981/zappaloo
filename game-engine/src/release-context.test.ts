import { describe, expect, it } from "vitest";
import { releaseContext } from "./release-context.ts";

describe("giving the graphics memory back when the game ends (PWA-07)", () => {
  it("[PWA-07] releases the WebGL context and shrinks the canvas buffer", () => {
    let lost = 0;
    const canvas = { width: 1170, height: 2000 };
    releaseContext({ getExtension: () => ({ loseContext: () => lost++ }) }, canvas);
    expect(lost).toBe(1);
    expect(canvas).toEqual({ width: 1, height: 1 });
  });

  it("[PWA-07] a browser without the extension still frees the canvas buffer", () => {
    const canvas = { width: 800, height: 600 };
    releaseContext({ getExtension: () => null }, canvas);
    expect(canvas).toEqual({ width: 1, height: 1 });
  });
});
