import { describe, expect, it } from "vitest";
import { findPath, type Cell } from "./pathfinding.ts";

const open = (columns: number, rows: number, wall: Cell[] = []) => ({
  columns,
  rows,
  walkable: (cell: Cell) => !wall.some((w) => w.column === cell.column && w.row === cell.row),
});

describe("the path of a tap (GAME-10)", () => {
  it("[GAME-10] a step that is not passable is never taken, the goal included", () => {
    const grid = {
      ...open(5, 5),
      passable: (_from: Cell, to: Cell) => !(to.column === 3 && to.row === 0),
    };
    expect(findPath(grid, { column: 0, row: 0 }, { column: 3, row: 0 })).toBeUndefined();
    expect(findPath(grid, { column: 0, row: 0 }, { column: 3, row: 1 })).toBeDefined();
  });

  it("[GAME-10] when no step out of the start is passable, there is no path", () => {
    const boxed = { ...open(5, 5), passable: () => false };
    expect(findPath(boxed, { column: 0, row: 0 }, { column: 3, row: 0 })).toBeUndefined();
  });

  it("[GAME-10] the path is the shortest one on open ground, both ends included", () => {
    const path = findPath(open(5, 5), { column: 0, row: 0 }, { column: 3, row: 0 });
    expect(path).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 0 },
      { column: 2, row: 0 },
      { column: 3, row: 0 },
    ]);
  });

  it("[GAME-10] the path goes around a wall, never through it", () => {
    const wall = [
      { column: 2, row: 0 },
      { column: 2, row: 1 },
      { column: 2, row: 2 },
    ];
    const path = findPath(open(5, 5, wall), { column: 0, row: 1 }, { column: 4, row: 1 });
    expect(path).toBeDefined();
    expect(
      path?.some((cell) => wall.some((w) => w.column === cell.column && w.row === cell.row)),
    ).toBe(false);
    expect(path?.[path.length - 1]).toEqual({ column: 4, row: 1 });
  });

  it("[GAME-10] an unreachable goal has no path", () => {
    const wall = [
      { column: 1, row: 0 },
      { column: 1, row: 1 },
    ];
    expect(
      findPath(open(3, 2, wall), { column: 0, row: 0 }, { column: 2, row: 0 }),
    ).toBeUndefined();
  });

  it("[GAME-03] a goal inside a blocked cell can still be reached, as a portal's trigger area can", () => {
    const wall = [{ column: 2, row: 0 }];
    expect(findPath(open(3, 1, wall), { column: 0, row: 0 }, { column: 2, row: 0 })).toBeDefined();
  });

  it("[GAME-10] a goal outside the map has no path", () => {
    expect(findPath(open(3, 3), { column: 0, row: 0 }, { column: 5, row: 0 })).toBeUndefined();
  });
});
