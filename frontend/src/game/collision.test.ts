import { describe, expect, it } from "vitest";
import { blocked, cellOf, clearLine, walkable, type Obstacles } from "./collision.ts";

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

// The centre of tile (column, row) in pixel space.
const centre = (column: number, row: number) => ({
  x: ((column + 0.5 - (row + 0.5)) * size.width) / 2,
  y: ((column + 0.5 + row + 0.5) * size.height) / 2,
});

describe("collisions (GAME-02, MAP-02)", () => {
  it("[GAME-02] a blocked cell of the collision layer blocks a figure standing in it", () => {
    expect(walkable(obstacles(), centre(0, 0), 4)).toBe(true);
    expect(walkable(obstacles(), centre(1, 1), 4)).toBe(false);
  });

  it("[GAME-02] a figure cannot leave the map", () => {
    expect(blocked(obstacles(), { x: 0, y: -400 }, 4)).toBe(true);
  });

  it("[GAME-02] a figure touching a solid polygon is blocked, one further away is not", () => {
    // The square sits around the centre of tile (2, 2), which is (0, 64) in pixel space.
    const square = [
      { x: -10, y: 54 },
      { x: 10, y: 54 },
      { x: 10, y: 74 },
      { x: -10, y: 74 },
    ];
    const map = obstacles({ solids: [square] });
    expect(blocked(map, { x: 0, y: 64 }, 4)).toBe(true);
    expect(blocked(map, { x: 0, y: 51 }, 4)).toBe(true);
    expect(blocked(map, { x: 40, y: 64 }, 4)).toBe(false);
  });

  it("[GAME-02] a border blocks its outline in both directions, while its inside stays walkable", () => {
    // Around the centre of tile (3, 0), (96, 64) in pixel space, away from the blocked cell.
    const border = [
      { x: 76, y: 44 },
      { x: 116, y: 44 },
      { x: 116, y: 84 },
      { x: 76, y: 84 },
    ];
    const map = obstacles({ borders: [border] });
    expect(blocked(map, { x: 96, y: 44 }, 4)).toBe(true);
    expect(blocked(map, { x: 96, y: 42 }, 4)).toBe(true);
    expect(blocked(map, { x: 96, y: 64 }, 4)).toBe(false);
  });

  it("[GAME-02] a clear line of sight is free of obstacles; a line through a blocked cell is not", () => {
    expect(clearLine(obstacles(), centre(0, 0), centre(0, 2), 4, 4)).toBe(true);
    expect(clearLine(obstacles(), centre(0, 0), centre(2, 2), 4, 4)).toBe(false);
  });

  it("[GAME-02] a point maps to its cell", () => {
    expect(cellOf(centre(2, 3), size)).toEqual({ column: 2, row: 3 });
  });
});
