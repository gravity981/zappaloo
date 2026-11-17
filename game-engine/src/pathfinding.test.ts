import { describe, expect, it } from "vitest";
import { cellKey, findPath, reachableCells, type Cell } from "./pathfinding.ts";

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

  it("[GAME-22] the path takes diagonal steps, a straight line of cells to a diagonal goal", () => {
    const path = findPath(open(5, 5), { column: 0, row: 0 }, { column: 3, row: 3 });
    expect(path).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 1 },
      { column: 2, row: 2 },
      { column: 3, row: 3 },
    ]);
  });

  it("[GAME-22] a diagonal step costs √2: it is preferred to two straight steps", () => {
    const path = findPath(open(5, 5), { column: 0, row: 0 }, { column: 2, row: 1 });
    expect(path).toHaveLength(3);
    expect(path?.[path.length - 1]).toEqual({ column: 2, row: 1 });
  });

  it("[GAME-22] a diagonal step past a blocked corner is not taken", () => {
    // (1, 0) is blocked: the step from (0, 0) to (1, 1) would cut its corner.
    const path = findPath(
      open(3, 3, [{ column: 1, row: 0 }]),
      { column: 0, row: 0 },
      { column: 1, row: 1 },
    );
    expect(path).toEqual([
      { column: 0, row: 0 },
      { column: 0, row: 1 },
      { column: 1, row: 1 },
    ]);
  });

  it("[GAME-22] a diagonal step in a small map is taken when both cells beside it are free", () => {
    const path = findPath(open(2, 2), { column: 0, row: 0 }, { column: 1, row: 1 });
    expect(path).toEqual([
      { column: 0, row: 0 },
      { column: 1, row: 1 },
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

describe("the reachable cells (GAME-23)", () => {
  it("[GAME-23] on open ground every cell is reachable, the start included", () => {
    const reached = reachableCells(open(4, 3), { column: 1, row: 1 });
    expect(reached.size).toBe(12);
    expect(reached.has(cellKey({ column: 1, row: 1 }))).toBe(true);
  });

  it("[GAME-23] a wall that splits the map leaves the far side out", () => {
    const wall = [0, 1, 2, 3].map((row) => ({ column: 2, row }));
    const reached = reachableCells(open(5, 4, wall), { column: 0, row: 0 });
    expect(reached.has(cellKey({ column: 1, row: 3 }))).toBe(true);
    expect(reached.has(cellKey({ column: 3, row: 0 }))).toBe(false);
    expect(reached.has(cellKey({ column: 2, row: 0 }))).toBe(false);
  });

  it("[GAME-23] a cell is reachable exactly when a path leads to it", () => {
    const wall = [
      { column: 1, row: 0 },
      { column: 1, row: 1 },
      { column: 3, row: 2 },
      { column: 3, row: 3 },
    ];
    const grid = open(5, 4, wall);
    const start = { column: 0, row: 0 };
    const reached = reachableCells(grid, start);
    for (let column = 0; column < 5; column++) {
      for (let row = 0; row < 4; row++) {
        const cell = { column, row };
        if (!grid.walkable(cell)) continue;
        expect(reached.has(cellKey(cell))).toBe(findPath(grid, start, cell) !== undefined);
      }
    }
  });
});

describe("several start cells (GAME-23)", () => {
  it("[GAME-23] the path begins at the start cell that leads to the goal best", () => {
    const path = findPath(
      open(6, 6),
      [
        { column: 0, row: 0 },
        { column: 4, row: 4 },
      ],
      { column: 5, row: 5 },
    );
    expect(path).toEqual([
      { column: 4, row: 4 },
      { column: 5, row: 5 },
    ]);
  });

  it("[GAME-23] a goal that is a start cell is reached with no step", () => {
    const here = { column: 2, row: 2 };
    expect(findPath(open(5, 5), [{ column: 0, row: 0 }, here], here)).toEqual([here]);
  });

  it("[GAME-23] the reachable cells are those of all the start cells together", () => {
    const wall = [0, 1, 2, 3].map((row) => ({ column: 2, row }));
    const grid = open(5, 4, wall);
    const both = reachableCells(grid, [
      { column: 0, row: 0 },
      { column: 4, row: 0 },
    ]);
    expect(both.has(cellKey({ column: 1, row: 3 }))).toBe(true);
    expect(both.has(cellKey({ column: 3, row: 3 }))).toBe(true);
    expect(both.has(cellKey({ column: 2, row: 0 }))).toBe(false);
  });
});
