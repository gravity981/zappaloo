// The way of a walk on a map (GAME-10): the grid of the cells the avatar fits, the steps between two cells that a
// clear line allows, and the waypoints of a walk from where the avatar stands. Tap-to-move and the walk to an
// object both use it, so a border or a thin wall between two cell centres is never crossed.
import {
  cellCentre,
  clearLine,
  playerCollisionEllipse,
  walkable,
  type Obstacles,
} from "./collision.ts";
import type { Point, TileSize } from "./geometry.ts";
import type { Cell, Grid } from "./pathfinding.ts";

/** The part of a parsed map that the walks use. */
export interface NavigableMap {
  size: TileSize;
  columns: number;
  rows: number;
  obstacles: Obstacles;
}

/** The distance between the samples of a clear-line check, in pixels. */
const SAMPLE_STEP = 2;

/** The grid of a map: a cell is walkable when the avatar fits its centre; a step is passable when the line between the centres is clear. */
export function navigationGrid(map: NavigableMap): Grid {
  const { size, obstacles } = map;
  const fits = new Map<string, boolean>();
  return {
    columns: map.columns,
    rows: map.rows,
    walkable: (cell) => {
      const key = `${cell.column},${cell.row}`;
      const known = fits.get(key);
      if (known !== undefined) return known;
      const result = walkable(
        obstacles,
        playerCollisionEllipse(cellCentre(cell.column, cell.row, size), size.width),
      );
      fits.set(key, result);
      return result;
    },
    passable: (from, to) =>
      clearLine(
        obstacles,
        cellCentre(from.column, from.row, size),
        cellCentre(to.column, to.row, size),
        size.width,
        SAMPLE_STEP,
      ),
  };
}

/**
 * Straightens a route (GAME-22): a waypoint is dropped whenever a clear line for the avatar's footprint leads from
 * the last kept point (the start at first) to a later one, so the avatar walks straight lines and turns only where an
 * obstacle makes it necessary. The next waypoint is always kept when no later one can be reached in a line, as it
 * was before, so a route never gets longer or leaves the cells it was found on.
 */
export function smoothRoute(map: NavigableMap, start: Point, route: readonly Point[]): Point[] {
  const { size, obstacles } = map;
  const kept: Point[] = [];
  let anchor = start;
  let index = 0;
  while (index < route.length) {
    let target = index;
    for (let candidate = route.length - 1; candidate > index; candidate--) {
      const point = route[candidate];
      if (point !== undefined && clearLine(obstacles, anchor, point, size.width, SAMPLE_STEP)) {
        target = candidate;
        break;
      }
    }
    const point = route[target];
    if (point === undefined) break;
    kept.push(point);
    anchor = point;
    index = target + 1;
  }
  return kept;
}

/**
 * The waypoints of a walk from `start` along a path of cells (its first cell is the start cell). A first stretch
 * that a clear line cannot take goes through the centre of the start cell first. With `end`, the walk goes on to
 * `end`, and is refused (undefined) when the last stretch to it is blocked. The waypoints are then smoothed
 * (`smoothRoute`).
 */
export function walkRoute(
  map: NavigableMap,
  start: Point,
  cells: readonly Cell[],
  end?: Point,
): Point[] | undefined {
  const { size, obstacles } = map;
  const points = cells.slice(1).map((cell) => cellCentre(cell.column, cell.row, size));
  const first = points[0];
  const startCell = cells[0];
  if (
    first !== undefined &&
    startCell !== undefined &&
    !clearLine(obstacles, start, first, size.width, SAMPLE_STEP)
  ) {
    points.unshift(cellCentre(startCell.column, startCell.row, size));
  }
  if (end !== undefined) {
    const from = points[points.length - 1] ?? start;
    if (!clearLine(obstacles, from, end, size.width, SAMPLE_STEP)) return undefined;
    points.push(end);
  }
  return smoothRoute(map, start, points);
}
