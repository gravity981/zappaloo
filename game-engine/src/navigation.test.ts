import { describe, expect, it } from "vitest";
import {
  cellCentre,
  cellOf,
  clearLine,
  playerCollisionEllipse,
  walkable,
  type Obstacles,
} from "./collision.ts";
import type { Point } from "./geometry.ts";
import { cellKey, findPath, reachableCells } from "./pathfinding.ts";
import {
  NEAREST_RADIUS_TILES,
  navigationGrid,
  nearestReachablePoint,
  routeToPoint,
  smoothRoute,
  startCells,
  walkRoute,
  type NavigableMap,
} from "./navigation.ts";

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

/** A map of `columns` × `rows` cells with the given cells blocked. */
function mapWithBlocked(columns: number, rows: number, blocked: Iterable<string>): NavigableMap {
  const base = map();
  return {
    size,
    columns,
    rows,
    obstacles: { ...base.obstacles, columns, rows, blockedCells: new Set(blocked) },
  };
}

function cells(columns: number[], rows: number[]): string[] {
  return columns.flatMap((column) => rows.map((row) => `${String(column)},${String(row)}`));
}

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

describe("the nearest reachable point (GAME-23)", () => {
  const radius = NEAREST_RADIUS_TILES * size.width;

  it("[GAME-23] a tap inside a building leads to the ground next to it", () => {
    // A building of 3 × 3 blocked cells in the middle of an open 12 × 12 map.
    const navigable = mapWithBlocked(12, 12, cells([5, 6, 7], [5, 6, 7]));
    const start = { column: 1, row: 1 };
    const reachable = reachableCells(navigationGrid(navigable), start);
    const tapped = centre(6, 6);
    const target = nearestReachablePoint(navigable, reachable, tapped);
    expect(target).toBeDefined();
    if (target === undefined) return;
    const point = target.point;
    expect(reachable.has(cellKey(target.cell))).toBe(true);
    expect(walkable(navigable.obstacles, playerCollisionEllipse(point, size.width))).toBe(true);
    expect(reachable.has(cellKey(cellOf(point, size)))).toBe(true);
    // The ground right in front of the building, not far away.
    expect(distance(point, tapped)).toBeLessThanOrEqual(radius);
    expect(distance(point, tapped)).toBeLessThan(120);
  });

  it("[GAME-23] a tap behind a wall leads to the reachable side, not to the far side", () => {
    // A wall of blocked cells that splits the 12 × 12 map: the avatar is left of it.
    const navigable = mapWithBlocked(12, 12, cells([5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));
    const start = { column: 2, row: 6 };
    const reachable = reachableCells(navigationGrid(navigable), start);
    const tapped = centre(7, 6); // free ground, but on the far side of the wall
    expect(reachable.has(cellKey({ column: 7, row: 6 }))).toBe(false);
    const target = nearestReachablePoint(navigable, reachable, tapped);
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(cellOf(target.point, size).column).toBeLessThanOrEqual(4);
    expect(reachable.has(cellKey(target.cell))).toBe(true);
  });

  it("[GAME-23] a tap farther than 3 tile widths from any reachable point does nothing", () => {
    // The avatar is shut into a pocket of four cells; the tap is far away on the open ground outside.
    const pocket = new Set(cells([1, 2], [1, 2]));
    const blocked: string[] = [];
    for (let column = 0; column < 20; column++) {
      for (let row = 0; row < 20; row++) {
        const key = `${String(column)},${String(row)}`;
        const outside = column >= 8 && column <= 16 && row >= 8 && row <= 16;
        if (!pocket.has(key) && !outside) blocked.push(key);
      }
    }
    const navigable = mapWithBlocked(20, 20, blocked);
    const reachable = reachableCells(navigationGrid(navigable), { column: 1, row: 1 });
    expect(reachable.size).toBe(4);
    expect(nearestReachablePoint(navigable, reachable, centre(12, 12))).toBeUndefined();
  });

  it("[GAME-23] a tap on free ground in a cell whose centre is blocked leads there through a reachable cell", () => {
    // A small post stands exactly at the centre of cell (4, 4): the avatar cannot stand on that centre, so no path
    // leads to the cell, but the ground 14 px beside the post is free.
    const c = centre(4, 4);
    const post: Point[] = [
      { x: c.x - 3, y: c.y - 3 },
      { x: c.x + 3, y: c.y - 3 },
      { x: c.x + 3, y: c.y + 3 },
      { x: c.x - 3, y: c.y + 3 },
    ];
    const navigable = map({ solids: [post] });
    const grid = navigationGrid(navigable);
    const start = { column: 1, row: 1 };
    const tapped = { x: c.x + 14, y: c.y };
    expect(walkable(navigable.obstacles, playerCollisionEllipse(tapped, size.width))).toBe(true);
    // No path leads to the tapped point's own cell ...
    expect(findPath(grid, start, cellOf(tapped, size))).toBeUndefined();
    // ... but the point is reached through the reachable cell it was found from.
    const target = nearestReachablePoint(navigable, reachableCells(grid, start), tapped);
    expect(target).toBeDefined();
    if (target === undefined) return;
    expect(target.point).toEqual(tapped);
    expect(findPath(grid, start, target.cell)).toBeDefined();
    const cellPath = findPath(grid, start, target.cell) ?? [];
    const route = walkRoute(navigable, centre(1, 1), cellPath, target.point);
    expect(route?.[route.length - 1]).toEqual(tapped);
  });

  it("[GAME-23] an avatar standing beside a post, in a cell whose centre is blocked, can still start a walk", () => {
    // The avatar stopped 14 px beside a post that stands on the centre of its cell, as it does after walking to the
    // edge of an obstacle. From the cell's centre no step is possible, from where the avatar stands it is.
    const c = centre(4, 4);
    const post: Point[] = [
      { x: c.x - 3, y: c.y - 3 },
      { x: c.x + 3, y: c.y - 3 },
      { x: c.x + 3, y: c.y + 3 },
      { x: c.x - 3, y: c.y + 3 },
    ];
    const navigable = map({ solids: [post] });
    const grid = navigationGrid(navigable);
    const position = { x: c.x + 14, y: c.y };
    const own = cellOf(position, size);
    expect(own).toEqual({ column: 4, row: 4 });
    expect(reachableCells(grid, own).size).toBe(1);
    const starts = startCells(navigable, grid, position);
    expect(starts.length).toBeGreaterThan(1);
    expect(starts.some((cell) => cell.column === 4 && cell.row === 4)).toBe(false);
    expect(reachableCells(grid, starts).size).toBeGreaterThan(30);
    // A walk from there leads to a far goal, round the post, as a straight line of waypoints.
    const goal = { column: 7, row: 6 };
    const cellPath = findPath(grid, starts, goal);
    expect(cellPath).toBeDefined();
    const route = walkRoute(navigable, position, cellPath ?? [], centre(7, 6));
    expect(route).toBeDefined();
    expect(everyStretchClear(navigable, position, route ?? [])).toBe(true);
    expect(route?.[route.length - 1]).toEqual(centre(7, 6));
  });

  it("[GAME-23] a tap in a cell next to the avatar's walks to that cell's centre", () => {
    const navigable = map();
    const grid = navigationGrid(navigable);
    const position = centre(3, 3);
    const goal = { column: 4, row: 3 };
    const starts = startCells(navigable, grid, position);
    expect(starts).toContainEqual(goal);
    const cellPath = findPath(grid, starts, goal);
    expect(cellPath).toEqual([goal]);
    expect(walkRoute(navigable, position, cellPath ?? [])).toEqual([centre(4, 3)]);
  });

  it("[GAME-23] a walk to a free point ends at that very point, not at the centre of its cell", () => {
    const navigable = map();
    const grid = navigationGrid(navigable);
    const position = centre(1, 1);
    const tapped = { x: centre(5, 4).x + 11, y: centre(5, 4).y - 5 };
    const cellPath = findPath(grid, startCells(navigable, grid, position), cellOf(tapped, size));
    expect(cellPath).toBeDefined();
    expect(routeToPoint(navigable, position, cellPath ?? [], tapped)).toEqual([tapped]);
  });

  it("[GAME-23] a tap inside the avatar's own cell walks to the tapped point", () => {
    const navigable = map();
    const position = centre(3, 3);
    const tapped = { x: position.x + 9, y: position.y + 4 };
    expect(routeToPoint(navigable, position, [cellOf(position, size)], tapped)).toEqual([tapped]);
  });

  it("[GAME-23] when the last stretch to the tapped point is blocked, the walk ends at the cell's centre", () => {
    // A wall of 2 px across the cell, between its centre and the tapped point.
    const c = centre(4, 4);
    const wall: Point[] = [
      { x: c.x + 6, y: c.y - 14 },
      { x: c.x + 8, y: c.y - 14 },
      { x: c.x + 8, y: c.y + 14 },
      { x: c.x + 6, y: c.y + 14 },
    ];
    const navigable = map({ solids: [wall] });
    const tapped = { x: c.x + 20, y: c.y };
    const position = centre(3, 4);
    const route = routeToPoint(
      navigable,
      position,
      [
        { column: 3, row: 4 },
        { column: 4, row: 4 },
      ],
      tapped,
    );
    expect(route).toEqual([c]);
  });

  it("[GAME-23] an avatar on open ground starts from its own cell among the cells around it", () => {
    const navigable = map();
    const grid = navigationGrid(navigable);
    const position = centre(3, 3);
    const starts = startCells(navigable, grid, position);
    expect(starts).toContainEqual({ column: 3, row: 3 });
    expect(starts.length).toBeLessThanOrEqual(9);
  });

  it("[GAME-23] a tap on a free, reachable point leads to that very point", () => {
    const navigable = map();
    const reachable = reachableCells(navigationGrid(navigable), { column: 1, row: 1 });
    const tapped = { x: centre(4, 4).x + 7, y: centre(4, 4).y - 3 };
    expect(nearestReachablePoint(navigable, reachable, tapped)?.point).toEqual(tapped);
  });
});
