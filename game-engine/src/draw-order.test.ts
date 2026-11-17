import { describe, expect, it } from "vitest";
import {
  figureDepth,
  figureOcclusionSegment,
  lineY,
  occlusionSegmentRelation,
} from "./draw-order.ts";

const TILE_WIDTH = 64;
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
    expect(figureDepth({ x: 32, y: 110 }, [behindOccluder], TILE_WIDTH)).toBe(99.5);
  });

  it("[GAME-19] a figure in front of an occlusion line is drawn in front of its object", () => {
    expect(figureDepth({ x: 32, y: 90 }, [frontOccluder], TILE_WIDTH)).toBe(100.5);
  });

  it("[GAME-19] uses a horizontal segment matching the collision ellipse", () => {
    expect(figureOcclusionSegment({ x: 35, y: 133 }, TILE_WIDTH)).toEqual({
      start: { x: 26.6, y: 133 },
      end: { x: 39.4, y: 133 },
      center: { x: 33, y: 133 },
    });
  });

  it("[GAME-19] the majority side of the segment decides when it crosses a guide", () => {
    const crossingGuide = {
      depth: 100,
      line: [
        { x: 23, y: 90 },
        { x: 29, y: 90 },
        { x: 30, y: 110 },
        { x: 31, y: 90 },
        { x: 37, y: 90 },
      ],
    };

    expect(figureDepth({ x: 32, y: 100 }, [crossingGuide], TILE_WIDTH)).toBe(100.5);
  });

  it("[GAME-19] a tie across the segment favors the figure being in front", () => {
    const crossingGuide = {
      depth: 100,
      line: [
        { x: 0, y: 70 },
        { x: 60, y: 130 },
      ],
    };

    expect(figureDepth({ x: 32, y: 100 }, [crossingGuide], TILE_WIDTH)).toBe(100.5);
  });

  it("[GAME-19] reports where an occlusion guide intersects the segment", () => {
    const segment = figureOcclusionSegment({ x: 32, y: 100 }, TILE_WIDTH);
    const relation = occlusionSegmentRelation(segment, [
      { x: 0, y: 70 },
      { x: 60, y: 130 },
    ]);

    expect(relation?.intersections).toEqual([{ x: 30, y: 100 }]);
  });

  it("[GAME-19] without a guide spanning the figure, the feet decide depth", () => {
    expect(figureDepth({ x: 200, y: 70 }, [frontOccluder], TILE_WIDTH)).toBe(70);
    expect(figureDepth({ x: 32, y: 70 }, [], TILE_WIDTH)).toBe(70);
  });

  it("[GAME-19] reads a slanted occlusion line at an x coordinate", () => {
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
    expect(figureDepth(feet, [fartherObjectInFront, nearerObjectBehind], TILE_WIDTH)).toBe(100.5);
    expect(figureDepth(feet, [nearerObjectBehind, fartherObjectInFront], TILE_WIDTH)).toBe(100.5);
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
    expect(
      figureDepth({ x: 32, y: 150 }, [behindNearerObject, inFrontOfFartherObject], TILE_WIDTH),
    ).toBe(200.5);
  });
});
