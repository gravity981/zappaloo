import { describe, expect, it } from "vitest";
import { cellCentre, clearLine, type Obstacles } from "./collision.ts";
import type { Point } from "./geometry.ts";
import { findPath } from "./pathfinding.ts";
import { navigationGrid, smoothRoute, walkRoute, type NavigableMap } from "./navigation.ts";

const size = { width: 64, height: 32 };

/** An 8 × 8 map of 64 × 32 tiles with the given obstacles. */
function map(extra: Partial<Obstacles> = {}): NavigableMap {
  return {
    size,
    columns: 8,
    rows: 8,
    obstacles: {
      size,
      columns: 8,
      rows: 8,
      blockedCells: new Set(),
      solids: [],
      borders: [],
      ...extra,
    },
  };
}

const centre = (column: number, row: number): Point => cellCentre(column, row, size);

/** A line of `half` pixels on each side of the middle of a → b, across it. */
function across(a: Point, b: Point, half: number): Point[] {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const side = { x: -dy * half, y: dx * half };
  return [
    { x: middle.x + side.x, y: middle.y + side.y },
    { x: middle.x - side.x, y: middle.y - side.y },
  ];
}

/** Whether every step of a path is passable on the map. */
function everyStepPasses(
  navigable: NavigableMap,
  cells: { column: number; row: number }[],
): boolean {
  const grid = navigationGrid(navigable);
  return cells.every((cell, index) => {
    const previous = cells[index - 1];
    return previous === undefined || grid.passable?.(previous, cell) !== false;
  });
}

describe("the way of a walk (GAME-10)", () => {
  it("[GAME-10] a border along the edge between two cells is never crossed; the path goes round it", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const navigable = map({ borders: [across(a, b, 40)] });
    const path = findPath(navigationGrid(navigable), { column: 2, row: 2 }, { column: 3, row: 2 });
    expect(path).toBeDefined();
    expect(path?.length ?? 0).toBeGreaterThan(2);
    expect(everyStepPasses(navigable, path ?? [])).toBe(true);
    expect(clearLine(navigable.obstacles, a, b, size.width, 2)).toBe(false);
  });

  it("[GAME-10] a thin collision rectangle between two cell centres is not crossed", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const [p, q] = across(a, b, 40);
    if (p === undefined || q === undefined) throw new Error("no line");
    // A rectangle 2 pixels thick, along the line across the middle of a → b.
    const thin: Point[] = [
      { x: p.x + 1, y: p.y + 1 },
      { x: q.x + 1, y: q.y + 1 },
      { x: q.x - 1, y: q.y - 1 },
      { x: p.x - 1, y: p.y - 1 },
    ];
    const navigable = map({ solids: [thin] });
    const path = findPath(navigationGrid(navigable), { column: 2, row: 2 }, { column: 3, row: 2 });
    expect(path).toBeDefined();
    expect(everyStepPasses(navigable, path ?? [])).toBe(true);
  });

  it("[GAME-10] the first stretch of a walk that a clear line cannot take goes through the start cell's centre", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const navigable = map({ borders: [across(a, b, 40)] });
    const route = walkRoute(navigable, a, [
      { column: 2, row: 2 },
      { column: 3, row: 2 },
    ]);
    expect(route).toEqual([a, b]);
  });

  it("[GAME-10] a walk to an end whose last stretch is blocked does not start", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const navigable = map({ borders: [across(a, b, 40)] });
    expect(walkRoute(navigable, a, [{ column: 2, row: 2 }], b)).toBeUndefined();
  });

  it("[GAME-10][GAME-22] on open ground the route ends with the end point, with no waypoint in between", () => {
    const navigable = map();
    const a = centre(2, 2);
    const c = centre(4, 2);
    const route = walkRoute(
      navigable,
      a,
      [
        { column: 2, row: 2 },
        { column: 3, row: 2 },
      ],
      c,
    );
    expect(route).toEqual([c]);
  });
});

/** Whether every stretch of a route, from `start`, is a clear line. */
function everyStretchClear(
  navigable: NavigableMap,
  start: Point,
  route: readonly Point[],
): boolean {
  let from = start;
  for (const point of route) {
    if (!clearLine(navigable.obstacles, from, point, size.width, 2)) return false;
    from = point;
  }
  return true;
}

describe("straight paths (GAME-22)", () => {
  it("[GAME-22] on an open map the route to a far point is a single straight segment", () => {
    const navigable = map();
    const start = centre(1, 1);
    const end = centre(6, 5);
    const cells = findPath(navigationGrid(navigable), { column: 1, row: 1 }, { column: 6, row: 5 });
    expect(cells).toBeDefined();
    expect(walkRoute(navigable, start, cells ?? [], end)).toEqual([end]);
  });

  it("[GAME-22] round one obstacle the route turns only where it has to", () => {
    // A wall of blocked cells between the start and the goal, open at both ends of the map's rows 0 and 7.
    const blocked = new Set<string>();
    for (let row = 1; row <= 6; row++) blocked.add(`4,${String(row)}`);
    const navigable = map({ blockedCells: blocked });
    const start = centre(1, 3);
    const end = centre(6, 3);
    const cells = findPath(navigationGrid(navigable), { column: 1, row: 3 }, { column: 6, row: 3 });
    expect(cells).toBeDefined();
    const route = walkRoute(navigable, start, cells ?? [], end);
    expect(route).toBeDefined();
    // The cell path has many cells; the route keeps the turning points round the wall and the end.
    expect((cells ?? []).length).toBeGreaterThan(6);
    expect(route?.length ?? 0).toBeLessThanOrEqual(3);
    expect(route?.[route.length - 1]).toEqual(end);
    expect(everyStretchClear(navigable, start, route ?? [])).toBe(true);
  });

  it("[GAME-22][GAME-10] a smoothed route never crosses a border or a thin collision shape", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const [p, q] = across(a, b, 40);
    if (p === undefined || q === undefined) throw new Error("no line");
    const thin: Point[] = [
      { x: p.x + 1, y: p.y + 1 },
      { x: q.x + 1, y: q.y + 1 },
      { x: q.x - 1, y: q.y - 1 },
      { x: p.x - 1, y: p.y - 1 },
    ];
    for (const extra of [{ borders: [across(a, b, 40)] }, { solids: [thin] }]) {
      const navigable = map(extra);
      const end = centre(5, 2);
      const cells = findPath(
        navigationGrid(navigable),
        { column: 2, row: 2 },
        { column: 5, row: 2 },
      );
      expect(cells).toBeDefined();
      const route = walkRoute(navigable, a, cells ?? [], end);
      expect(route).toBeDefined();
      expect(everyStretchClear(navigable, a, route ?? [])).toBe(true);
      // It does not run straight through: there is a turn before the end.
      expect(route?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it("[GAME-22] smoothing keeps the next waypoint when no later one can be reached in a line", () => {
    const a = centre(2, 2);
    const b = centre(3, 2);
    const navigable = map({ borders: [across(a, b, 40)] });
    const route = [b];
    expect(smoothRoute(navigable, a, route)).toEqual(route);
    expect(smoothRoute(navigable, a, [])).toEqual([]);
  });
});
