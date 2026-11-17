import { describe, expect, it } from "vitest";
import { figureDepth, figureOcclusionPoint, lineY } from "./draw-order.ts";

const frontOccluder = {
  depth: 100,
  line: [
    { x: 0, y: 80 },
    { x: 64, y: 80 },
  ],
};
const behindOccluder = {
  depth: 100,
  line: [
    { x: 0, y: 120 },
    { x: 64, y: 120 },
  ],
};

describe("the draw order (GAME-19)", () => {
  it("[GAME-19] a figure behind an occlusion line is drawn behind its object", () => {
    expect(figureDepth({ x: 32, y: 110 }, [behindOccluder])).toBe(99.5);
  });

  it("[GAME-19] a figure in front of an occlusion line is drawn in front of its object", () => {
    expect(figureDepth({ x: 32, y: 90 }, [frontOccluder])).toBe(100.5);
  });

  it("[GAME-19] evaluates occlusion three pixels left of the logical feet", () => {
    const feet = { x: 35, y: 133 };
    const slantedOccluder = {
      depth: 100,
      line: [
        { x: 0, y: 100 },
        { x: 64, y: 164 },
      ],
    };
    expect(figureOcclusionPoint(feet)).toEqual({ x: 32, y: 133 });
    expect(figureDepth(feet, [slantedOccluder])).toBe(133);
  });

  it("[GAME-19] without a line spanning the figure, the feet decide depth", () => {
    expect(figureDepth({ x: 200, y: 70 }, [frontOccluder])).toBe(70);
    expect(figureDepth({ x: 32, y: 70 }, [])).toBe(70);
  });

  it("[GAME-19] reads a slanted occlusion line at the figure's x", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(lineY(line, 5)).toBe(5);
    expect(lineY(line, 20)).toBeUndefined();
  });

  it("[GAME-19] overlapping guides produce the same depth regardless of input order", () => {
    const fartherObjectInFront = {
      depth: 200,
      line: [
        { x: 0, y: 120 },
        { x: 64, y: 120 },
      ],
    };
    const nearerObjectBehind = {
      depth: 100,
      line: [
        { x: 0, y: 80 },
        { x: 64, y: 80 },
      ],
    };
    const feet = { x: 32, y: 90 };
    expect(figureDepth(feet, [fartherObjectInFront, nearerObjectBehind])).toBe(100.5);
    expect(figureDepth(feet, [nearerObjectBehind, fartherObjectInFront])).toBe(100.5);
  });

  it("[GAME-19] when guides conflict, a tied depth favors the figure being in front", () => {
    const behindNearerObject = {
      depth: 100,
      line: [
        { x: 0, y: 120 },
        { x: 64, y: 120 },
      ],
    };
    const inFrontOfFartherObject = {
      depth: 200,
      line: [
        { x: 0, y: 80 },
        { x: 64, y: 80 },
      ],
    };
    expect(figureDepth({ x: 32, y: 150 }, [behindNearerObject, inFrontOfFartherObject])).toBe(
      200.5,
    );
  });
});
