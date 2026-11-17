import { describe, expect, it } from "vitest";
import { cellCentre, clearLine, type Obstacles } from "./collision.ts";
import type { Point } from "./geometry.ts";
import { findPath } from "./pathfinding.ts";
import { navigationGrid, walkRoute, type NavigableMap } from "./navigation.ts";

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

  it("[GAME-10] on open ground the route ends with the end point", () => {
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
    expect(route).toEqual([centre(3, 2), c]);
  });
});
