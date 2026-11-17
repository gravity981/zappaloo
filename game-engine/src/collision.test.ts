import { describe, expect, it } from "vitest";
import { blocked, cellCentre, cellOf, clearLine, walkable, type Obstacles } from "./collision.ts";

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

describe("collisions (GAME-02, MAP-02)", () => {
  it("[GAME-02] a blocked cell of the collision layer blocks a figure standing in it", () => {
    expect(walkable(obstacles(), centre(0, 0), 4)).toBe(true);
    expect(walkable(obstacles(), centre(1, 1), 4)).toBe(false);
  });

  it("[GAME-02] a figure cannot leave the map", () => {
    expect(blocked(obstacles(), { x: 0, y: -400 }, 4)).toBe(true);
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
    expect(blocked(map, centre(2, 2), 4)).toBe(true);
    expect(blocked(map, { x: 32, y: 67 }, 4)).toBe(true);
    expect(blocked(map, { x: 72, y: 80 }, 4)).toBe(false);
  });

  it("[GAME-02] the circular footprint is anchored at the figure's feet", () => {
    const belowFeet = [
      { x: 56, y: 65 },
      { x: 72, y: 65 },
      { x: 72, y: 80 },
      { x: 56, y: 80 },
    ];
    const clearMap = { blockedCells: new Set<string>() };
    expect(walkable(obstacles({ ...clearMap, solids: [belowFeet] }), { x: 64, y: 64 }, 12)).toBe(
      true,
    );
    expect(walkable(obstacles(clearMap), { x: 64, y: 64 }, 12)).toBe(true);
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
    expect(blocked(map, { x: 128, y: 44 }, 4)).toBe(true);
    expect(blocked(map, { x: 128, y: 42 }, 4)).toBe(true);
    expect(blocked(map, centre(3, 0), 4)).toBe(false);
  });

  it("[GAME-02] a clear line of sight is free of obstacles; a line through a blocked cell is not", () => {
    expect(clearLine(obstacles(), centre(0, 0), centre(0, 2), 4, 4)).toBe(true);
    expect(clearLine(obstacles(), centre(0, 0), centre(2, 2), 4, 4)).toBe(false);
  });

  it("[GAME-02] a point maps to its cell", () => {
    expect(cellOf(centre(2, 3), size)).toEqual({ column: 2, row: 3 });
  });
});
