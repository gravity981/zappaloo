import { describe, expect, it } from "vitest";
import { canvasBufferSize, canvasPixelRatio, snapToPixelGrid } from "./pixel-grid.ts";

describe("the canvas's pixel grid (GAME-27)", () => {
  it("[GAME-27] the pixel ratio is the device pixel ratio, from 1 to 3", () => {
    expect(canvasPixelRatio(1)).toBe(1);
    expect(canvasPixelRatio(2)).toBe(2);
    expect(canvasPixelRatio(3)).toBe(3);
    expect(canvasPixelRatio(1.25)).toBe(1.25);
    expect(canvasPixelRatio(4)).toBe(3);
    expect(canvasPixelRatio(0.5)).toBe(1);
    expect(canvasPixelRatio(Number.NaN)).toBe(1);
  });

  it("[GAME-27] the canvas buffer has the CSS size times the ratio, rounded to whole device pixels", () => {
    expect(canvasBufferSize({ width: 390, height: 664 }, 1)).toEqual({ width: 390, height: 664 });
    expect(canvasBufferSize({ width: 390, height: 664 }, 2)).toEqual({ width: 780, height: 1328 });
    expect(canvasBufferSize({ width: 390, height: 664 }, 3)).toEqual({ width: 1170, height: 1992 });
    expect(canvasBufferSize({ width: 390.4, height: 663.5 }, 3)).toEqual({
      width: 1171,
      height: 1991,
    });
    expect(canvasBufferSize({ width: 0, height: 0 }, 3)).toEqual({ width: 1, height: 1 });
  });

  it("[GAME-27] a snapped value lies on the device-pixel grid", () => {
    // Zoom 2 at ratio 3: one device pixel is 1/6 of a world pixel.
    expect(snapToPixelGrid(10.1, 2, 3)).toBeCloseTo(10 + 1 / 6, 10);
    expect(snapToPixelGrid(10, 2, 3)).toBe(10);
    // Without a ratio the grid is half a world pixel at zoom 2.
    expect(snapToPixelGrid(10.3, 2, 1)).toBe(10.5);
    expect(snapToPixelGrid(10.2, 2, 1)).toBe(10);
  });

  it("[GAME-27] a constant speed moves the view in small, even steps, not in 1-and-2 world pixel jumps", () => {
    const zoom = 2;
    const ratio = 3;
    // 89.6 px per second at 60 fps is about 1.49 world pixels per frame.
    const speed = 89.6 / 60;
    const steps: number[] = [];
    let previous = snapToPixelGrid(0, zoom, ratio);
    for (let frame = 1; frame <= 120; frame++) {
      const next = snapToPixelGrid(frame * speed, zoom, ratio);
      steps.push(Math.round((next - previous) * zoom * ratio));
      previous = next;
    }
    // In device pixels: 9 or 8 (never 6 and 12 in turn, as with whole world pixels).
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...steps)).toBeLessThanOrEqual(9);
  });

  it("[GAME-27] snapping is stable: a value already on the grid stays, so camera and sprite agree for any canvas size", () => {
    const zoom = 2;
    const ratio = 3;
    for (const feet of [100.1, 100.4, 237.77, 1000.5]) {
      const sprite = snapToPixelGrid(feet, zoom, ratio);
      // The camera is centred on the snapped sprite: snapping it again changes nothing, so the avatar's distance to
      // the canvas centre is the same number of whole device pixels every frame (an odd canvas width only adds a
      // constant half pixel).
      expect(snapToPixelGrid(sprite, zoom, ratio)).toBe(sprite);
      expect(Math.abs(sprite - feet) * zoom * ratio).toBeLessThanOrEqual(0.5 + 1e-9);
    }
  });
});
