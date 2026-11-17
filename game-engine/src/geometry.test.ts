import { describe, expect, it } from "vitest";
import {
  distanceToOutline,
  interiorPoint,
  mapBounds,
  pixelToTile,
  pointInPolygon,
  polygonCentre,
  tiledToWorld,
  tileToPixel,
  tiledTileObjectToWorld,
  worldToTiled,
  worldToTiledTileObject,
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

  it("[GAME-20] Tiled object positions and world pixels convert both ways", () => {
    expect(tiledToWorld({ x: 64, y: 32 }, size)).toEqual({ x: 32, y: 48 });
    expect(worldToTiled({ x: 32, y: 48 }, size)).toEqual({ x: 64, y: 32 });
    const tiled = { x: 73.5, y: 41.25 };
    const world = tiledToWorld(tiled, { width: 80, height: 40 });
    expect(worldToTiled(world, { width: 80, height: 40 })).toEqual(tiled);
  });

  it("[GAME-20] Tiled tile-object anchors follow the documented convention and invert", () => {
    expect(tiledTileObjectToWorld({ x: 64, y: 32 }, size)).toEqual({ x: 64, y: 48 });
    expect(worldToTiledTileObject({ x: 64, y: 48 }, size)).toEqual({ x: 64, y: 32 });
    expect(tiledTileObjectToWorld({ x: 64, y: 96 }, size)).toEqual({ x: 0, y: 80 });
    const tiled = { x: 73.5, y: 101.25 };
    const world = tiledTileObjectToWorld(tiled, { width: 80, height: 40 });
    expect(worldToTiledTileObject(world, { width: 80, height: 40 })).toEqual(tiled);
  });

  it("[GAME-20] map bounds include the projected overhang of the outer isometric cells", () => {
    expect(mapBounds(4, 3, size)).toEqual({
      x: -64,
      y: 0,
      width: 224,
      height: 112,
    });
  });

  it("[GAME-02] a point is inside a polygon, and its distance to the outline is measured", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
    expect(distanceToOutline({ x: 5, y: 5 }, square)).toBe(5);
  });

  it("[GAME-16] a trigger area's centre lies inside it", () => {
    expect(polygonCentre(square)).toEqual({ x: 5, y: 5 });
  });

  it("[GAME-10] the tap target of an L-shaped portal lies inside the portal, although its box centre does not", () => {
    const L = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon(polygonCentre(L), L)).toBe(false);
    expect(pointInPolygon(interiorPoint(L), L)).toBe(true);
    // A convex trigger keeps its centre.
    expect(interiorPoint(square)).toEqual({ x: 5, y: 5 });
  });
});
