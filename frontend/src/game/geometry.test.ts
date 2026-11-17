import { describe, expect, it } from "vitest";
import {
  distanceToOutline,
  pixelToTile,
  pointInPolygon,
  polygonCentre,
  tileToPixel,
} from "./geometry.ts";

const size = { width: 64, height: 32 };
const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe("the isometric geometry (MAP-02, GAME-02)", () => {
  it("[MAP-02] a tile corner projects to the diamond of the map: 2:1 tiles", () => {
    expect(tileToPixel({ x: 1, y: 0 }, size)).toEqual({ x: 32, y: 16 });
    expect(tileToPixel({ x: 0, y: 1 }, size)).toEqual({ x: -32, y: 16 });
    expect(tileToPixel({ x: 2, y: 2 }, size)).toEqual({ x: 0, y: 64 });
  });

  it("[MAP-02] pixel and tile coordinates convert both ways", () => {
    const tile = { x: 3.25, y: 1.5 };
    const back = pixelToTile(tileToPixel(tile, size), size);
    expect(back.x).toBeCloseTo(tile.x);
    expect(back.y).toBeCloseTo(tile.y);
  });

  it("[GAME-02] a point is inside a polygon, and its distance to the outline is measured", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(distanceToOutline({ x: 5, y: 5 }, square)).toBe(5);
  });

  it("[GAME-03] a trigger area's centre lies inside it", () => {
    expect(polygonCentre(square)).toEqual({ x: 5, y: 5 });
  });
});
