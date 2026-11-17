import { describe, expect, it } from "vitest";
import {
  blocked,
  cellCentre,
  cellOf,
  clearLine,
  PLAYER_COLLISION_RADII_TILES,
  playerCollisionEllipse,
  walkable,
  type Obstacles,
} from "./collision.ts";
import type { Point } from "./geometry.ts";

const size = { width: 64, height: 32 };

/** A 4 × 4 map with cell (1,1) blocked, a solid square and a border around a walkable inside. */
function obstacles(extra: Partial<Obstacles> = {}): Obstacles {
  return {
    size,
    columns: 4,
    rows: 4,
    blockedCells: new Set(["1,1"]),
    solids: [],
    borders: [],
    ...extra,
  };
}

// The centre of a cell, where it is drawn.
const centre = (column: number, row: number) => cellCentre(column, row, size);
const footprint = (feet: Point, tileWidth = 40) => playerCollisionEllipse(feet, tileWidth);

describe("collisions (GAME-02, MAP-02)", () => {
  it("[GAME-02] a blocked cell of the collision layer blocks a figure standing in it", () => {
    expect(walkable(obstacles(), footprint(centre(0, 0)))).toBe(true);
    expect(walkable(obstacles(), footprint(centre(1, 1)))).toBe(false);
  });

  it("[GAME-02] a figure cannot leave the map", () => {
    expect(blocked(obstacles(), footprint({ x: 0, y: -400 }))).toBe(true);
  });

  it("[GAME-02] the 0.1-by-0.05-tile ellipse clears an 8-pixel gap but blocks within its radii", () => {
    const wall = [
      { x: 72, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 72, y: 100 },
    ];
    const map = obstacles({ solids: [wall] });
    expect(PLAYER_COLLISION_RADII_TILES).toEqual({ x: 0.1, y: 0.05 });
    expect(walkable(map, footprint({ x: 64, y: 64 }, size.width))).toBe(true);
    expect(walkable(map, footprint({ x: 67.7, y: 64 }, size.width))).toBe(false);
  });

  it("[GAME-02] a figure touching a solid polygon is blocked, one further away is not", () => {
    // The square sits around the centre of cell (2, 2).
    const square = [
      { x: 22, y: 70 },
      { x: 42, y: 70 },
      { x: 42, y: 90 },
      { x: 22, y: 90 },
    ];
    const map = obstacles({ solids: [square] });
    expect(blocked(map, footprint(centre(2, 2)))).toBe(true);
    expect(blocked(map, footprint({ x: 32, y: 68.5 }))).toBe(true);
    expect(blocked(map, footprint({ x: 72, y: 80 }))).toBe(false);
  });

  it("[GAME-02] the ellipse is centered 2 pixels left of the logical feet", () => {
    const withinEllipse = [
      { x: 63, y: 66 },
      { x: 65, y: 66 },
      { x: 65, y: 67 },
      { x: 63, y: 67 },
    ];
    const beyondEllipse = [
      { x: 63, y: 68 },
      { x: 65, y: 68 },
      { x: 65, y: 70 },
      { x: 63, y: 70 },
    ];
    const clearMap = { blockedCells: new Set<string>() };
    const feet = { x: 64, y: 64 };
    expect(
      walkable(obstacles({ ...clearMap, solids: [withinEllipse] }), footprint(feet, size.width)),
    ).toBe(false);
    expect(
      walkable(obstacles({ ...clearMap, solids: [beyondEllipse] }), footprint(feet, size.width)),
    ).toBe(true);
  });

  it("[GAME-02] exposes the exact collision ellipse used by the player", () => {
    expect(playerCollisionEllipse({ x: 64, y: 64 }, size.width)).toEqual({
      center: { x: 62, y: 64 },
      radiusX: 6.4,
      radiusY: 3.2,
    });
  });

  it("[GAME-02] a border blocks its outline in both directions, while its inside stays walkable", () => {
    // Around the centre of cell (3, 0).
    const border = [
      { x: 108, y: 44 },
      { x: 148, y: 44 },
      { x: 148, y: 84 },
      { x: 108, y: 84 },
    ];
    const map = obstacles({ borders: [border] });
    expect(blocked(map, footprint({ x: 128, y: 44 }))).toBe(true);
    expect(blocked(map, footprint({ x: 128, y: 43 }))).toBe(true);
    expect(blocked(map, footprint(centre(3, 0)))).toBe(false);
  });

  it("[GAME-02] a clear line of sight is free of obstacles; a line through a blocked cell is not", () => {
    expect(clearLine(obstacles(), centre(0, 0), centre(0, 2), 40, 4)).toBe(true);
    expect(clearLine(obstacles(), centre(0, 0), centre(2, 2), 40, 4)).toBe(false);
  });

  it("[GAME-02] a point maps to its cell", () => {
    expect(cellOf(centre(2, 3), size)).toEqual({ column: 2, row: 3 });
  });
});
