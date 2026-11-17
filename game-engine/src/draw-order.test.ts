import { describe, expect, it } from "vitest";
import {
  figureBounds,
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

  it("[GAME-19] a figure in front of a building and behind a prop with a lower depth is drawn over the prop, not behind the building", () => {
    // The building's lowest edge (depth 910) is below the prop's (905), as with a V-shaped front whose corner lies
    // far from the prop; the prop stands well in front of the building's front edge at its place.
    const building = {
      depth: 910,
      line: [
        { x: 0, y: 851 },
        { x: 40, y: 910 },
        { x: 160, y: 840 },
      ],
    };
    const prop = {
      depth: 905,
      line: [
        { x: 100, y: 899 },
        { x: 132, y: 904 },
        { x: 149, y: 899 },
      ],
    };
    // In front of the building's front edge there (about 848), behind the prop's (about 899).
    const feet = { x: 112, y: 880 };
    expect(figureDepth(feet, [building, prop], TILE_WIDTH)).toBe(910.5);
    expect(figureDepth(feet, [prop, building], TILE_WIDTH)).toBe(910.5);
  });

  it("[GAME-19] a guide that would hide the figure counts double: the figure is hidden only to keep it behind two or more objects", () => {
    const building = {
      depth: 910,
      line: [
        { x: 0, y: 840 },
        { x: 160, y: 840 },
      ],
    };
    const prop = (depth: number) => ({
      depth,
      line: [
        { x: 100, y: depth - 5 },
        { x: 149, y: depth - 5 },
      ],
    });
    const feet = { x: 112, y: 880 };
    // One prop: the figure is over it. Two props: both guides together cost as much as hiding it, so the slot
    // closest to the feet decides (behind the building, where the feet are).
    expect(figureDepth(feet, [building, prop(905)], TILE_WIDTH)).toBe(910.5);
    expect(figureDepth(feet, [building, prop(905), prop(900)], TILE_WIDTH)).toBe(880);
    // Three props: the figure stays behind them, though that hides it behind the building.
    expect(figureDepth(feet, [building, prop(905), prop(900), prop(895)], TILE_WIDTH)).toBe(880);
  });

  it("[GAME-19] an object whose picture the figure does not overlap does not decide the figure's depth", () => {
    const building = {
      depth: 910,
      line: [
        { x: 0, y: 840 },
        { x: 200, y: 840 },
      ],
      bounds: { x: 0, y: 500, width: 200, height: 410 },
    };
    // Three bushes below the figure: it stands behind each of them, but their pictures lie far from its own.
    const bush = (x: number) => ({
      depth: 905 - x / 100,
      line: [
        { x: x - 10, y: 930 },
        { x: x + 10, y: 930 },
      ],
      bounds: { x: x - 20, y: 900, width: 40, height: 40 },
    });
    const bushes = [bush(100), bush(104), bush(108)];
    const feet = { x: 104, y: 850 };
    // Without bounds each bush would count and keep the figure behind the building (3 guides against 1).
    const withoutBounds = [building, ...bushes].map(({ depth, line }) => ({ depth, line }));
    expect(figureDepth(feet, withoutBounds, TILE_WIDTH)).toBe(850);
    // With bounds, none of them is near the figure, and it is drawn in front of the building.
    expect(figureDepth(feet, [building, ...bushes], TILE_WIDTH)).toBe(910.5);
  });

  it("[GAME-19] an object whose picture the figure overlaps still decides, and one without bounds always does", () => {
    const prop = {
      depth: 100,
      line: [
        { x: 0, y: 120 },
        { x: 64, y: 120 },
      ],
      bounds: { x: 20, y: 90, width: 30, height: 30 },
    };
    const feet = { x: 32, y: 110 };
    // The figure stands behind the prop, which it overlaps: it is drawn behind it.
    expect(figureDepth(feet, [prop], TILE_WIDTH)).toBe(99.5);
    // The same prop far to the right: no overlap, so the feet alone decide.
    expect(figureDepth(feet, [{ ...prop, bounds: { ...prop.bounds, x: 400 } }], TILE_WIDTH)).toBe(
      110,
    );
    // Without bounds it always decides.
    expect(figureDepth(feet, [{ depth: prop.depth, line: prop.line }], TILE_WIDTH)).toBe(99.5);
  });

  it("[GAME-19] the figure's part of the screen is as wide as a tile and reaches a tile above its feet", () => {
    expect(figureBounds({ x: 100, y: 200 }, 64)).toEqual({ x: 68, y: 136, width: 64, height: 68 });
  });
});
