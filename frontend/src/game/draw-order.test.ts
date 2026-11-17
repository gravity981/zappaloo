import { describe, expect, it } from "vitest";
import { figureDepth, lineY } from "./draw-order.ts";

// A tile object whose bottom edge is at y = 100 and whose occlusion line runs across it at y = 80.
const occluder = {
  depth: 100,
  line: [
    { x: 0, y: 80 },
    { x: 64, y: 80 },
  ],
};

describe("the draw order (GAME-19)", () => {
  it("[GAME-19] a figure whose feet are behind the occlusion line is drawn behind the object", () => {
    const depth = figureDepth({ x: 32, y: 70 }, [occluder]);
    expect(depth).toBeLessThan(occluder.depth);
  });

  it("[GAME-19] a figure whose feet are in front of the occlusion line is drawn in front of the object", () => {
    const depth = figureDepth({ x: 32, y: 120 }, [occluder]);
    expect(depth).toBeGreaterThan(occluder.depth);
  });

  it("[GAME-19] without a line that spans the figure, the feet decide alone", () => {
    expect(figureDepth({ x: 200, y: 70 }, [occluder])).toBe(70);
    expect(figureDepth({ x: 32, y: 70 }, [])).toBe(70);
  });

  it("[GAME-19] the occlusion line is read at the figure's x, between its points", () => {
    const slanted = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(lineY(slanted, 5)).toBe(5);
    expect(lineY(slanted, 20)).toBeUndefined();
  });
});
