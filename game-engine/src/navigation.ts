// The way of a walk on a map (GAME-10): the grid of the cells the avatar fits, the steps between two cells that a
// clear line allows, and the waypoints of a walk from where the avatar stands. Tap-to-move and the walk to an
// object both use it, so a border or a thin wall between two cell centres is never crossed.
import {
  cellCentre,
  cellOf,
  clearLine,
  playerCollisionEllipse,
  walkable,
  type Obstacles,
} from "./collision.ts";
import type { Point, TileSize } from "./geometry.ts";
import { cellKey, type Cell, type Grid } from "./pathfinding.ts";

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
  // The steps are checked again and again by the searches (and in both directions), so each is worked out once.
  const passes = new Map<string, boolean>();
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
    passable: (from, to) => {
      const forward = `${cellKey(from)}>${cellKey(to)}`;
      const known = passes.get(forward);
      if (known !== undefined) return known;
      const result = clearLine(
        obstacles,
        cellCentre(from.column, from.row, size),
        cellCentre(to.column, to.row, size),
        size.width,
        SAMPLE_STEP,
      );
      // A line is clear in both directions or in none.
      passes.set(forward, result);
      passes.set(`${cellKey(to)}>${cellKey(from)}`, result);
      return result;
    },
  };
}

/**
 * The cells a walk starts from when the avatar stands at `position` (GAME-23): its own cell and the eight around it,
 * where the avatar fits the centre and a clear line leads there from where it stands. The steps of the search are
 * checked from cell centre to cell centre, so searching from the avatar's cell alone would fail whenever it stands
 * beside an obstacle in a cell whose centre is blocked or cut off, as it does after walking to the edge of a
 * building. Without any such cell, the avatar's own cell is the start.
 */
export function startCells(map: NavigableMap, grid: Grid, position: Point): Cell[] {
  const { size, obstacles } = map;
  const own = cellOf(position, size);
  const cells: Cell[] = [];
  for (let column = own.column - 1; column <= own.column + 1; column++) {
    for (let row = own.row - 1; row <= own.row + 1; row++) {
      if (column < 0 || row < 0 || column >= map.columns || row >= map.rows) continue;
      const cell = { column, row };
      if (!grid.walkable(cell)) continue;
      if (clearLine(obstacles, position, cellCentre(column, row, size), size.width, SAMPLE_STEP)) {
        cells.push(cell);
      }
    }
  }
  return cells.length > 0 ? cells : [own];
}

/** How far from the tapped point a blocked tap may lead, in tile widths (GAME-23). */
export const NEAREST_RADIUS_TILES = 3;

/** Where a blocked tap leads: the point to walk to, and the reachable cell that a path leads to before it (GAME-23). */
export interface NearestTarget {
  point: Point;
  /** The reachable cell the point was found from: the path goes to this cell, and then in a line to the point. */
  cell: Cell;
}

/**
 * Where a tap on a blocked or unreachable point leads (GAME-23): the point nearest to `tapped`, within
 * {@link NEAREST_RADIUS_TILES} tile widths of it, that the avatar fits on and that lies in one of the `reachable`
 * cells (the keys from `reachableCells`), or undefined when there is none. Of each reachable cell the point is its
 * centre, moved towards the tapped point as far as a clear line for the avatar's footprint allows, so a tap on a house
 * leads to the ground in front of it and never through a wall to its far side.
 */
export function nearestReachablePoint(
  map: NavigableMap,
  reachable: ReadonlySet<string>,
  tapped: Point,
): NearestTarget | undefined {
  const { size, obstacles } = map;
  const radius = NEAREST_RADIUS_TILES * size.width;
  // Cells within a distance D of the tapped cell differ by at most D / tile width + D / tile height columns or rows
  // (a step along a column or a row moves half a tile width and half a tile height), and a centre may be half a tile
  // width off the tapped point.
  const reach = radius + size.width;
  const window = Math.ceil(reach / size.width + reach / size.height) + 1;
  const tappedCell = cellOf(tapped, size);
  // A point is moved past the centre of its cell by at most one tile width. So no candidate whose centre is farther
  // than that beyond the best point found so far can beat it, and the search can stop there.
  const advance = size.width;
  const candidates: { cell: Cell; centre: Point; distance: number }[] = [];
  for (let column = tappedCell.column - window; column <= tappedCell.column + window; column++) {
    for (let row = tappedCell.row - window; row <= tappedCell.row + window; row++) {
      if (!reachable.has(cellKey({ column, row }))) continue;
      const centre = cellCentre(column, row, size);
      const distance = Math.hypot(centre.x - tapped.x, centre.y - tapped.y);
      if (distance <= radius + size.width / 2)
        candidates.push({ cell: { column, row }, centre, distance });
    }
  }
  candidates.sort((first, second) => first.distance - second.distance);
  let best: (NearestTarget & { distance: number }) | undefined;
  for (const candidate of candidates) {
    if (best !== undefined && candidate.distance - advance > best.distance) break;
    const point = towards(obstacles, candidate.centre, tapped, size.width, advance);
    const distance = Math.hypot(point.x - tapped.x, point.y - tapped.y);
    if (distance <= radius && (best === undefined || distance < best.distance)) {
      best = { point, cell: candidate.cell, distance };
    }
  }
  return best === undefined ? undefined : { point: best.point, cell: best.cell };
}

/** The farthest point on the line from `from` towards `to` that a clear line from `from` leads to. */
function towards(
  obstacles: NavigableMap["obstacles"],
  from: Point,
  to: Point,
  tileWidth: number,
  maxAdvance: number,
): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  // The farthest the point may go: the tapped point itself, or `maxAdvance` towards it.
  const limit = length <= maxAdvance ? 1 : maxAdvance / length;
  const at = (t: number): Point =>
    t === 1 ? to : { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  if (clearLine(obstacles, from, at(limit), tileWidth, SAMPLE_STEP)) return at(limit);
  // A prefix of a clear line is clear, so the farthest clear point can be bisected (to about a pixel).
  let near = 0;
  let far = limit;
  for (let step = 0; step < 6; step++) {
    const middle = (near + far) / 2;
    if (clearLine(obstacles, from, at(middle), tileWidth, SAMPLE_STEP)) near = middle;
    else far = middle;
  }
  return at(near);
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
 * The waypoints of a walk to an exact `point` (GAME-23): along the path of cells and then in a line to the point, so the
 * avatar stops where the player tapped. When the last stretch to the point is blocked, the walk ends at the centre of
 * the last cell instead.
 */
export function routeToPoint(
  map: NavigableMap,
  start: Point,
  cells: readonly Cell[],
  point: Point,
): Point[] {
  return walkRoute(map, start, cells, point) ?? walkRoute(map, start, cells) ?? [];
}

/**
 * The waypoints of a walk from `start` along a path of cells (its first cell is the avatar's own cell, or one of the
 * cells it can start from, see `startCells`). A first stretch that a clear line cannot take goes through the centre of
 * the own cell first. With `end`, the walk goes on to
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
  const startCell = cells[0];
  const own = cellOf(start, size);
  // The avatar stands in its own cell, so that one is no waypoint. A path may also begin at a neighbouring cell (see
  // startCells): that cell is the first waypoint, and a walk to it is a walk to its centre.
  const standsIn = startCell?.column === own.column && startCell.row === own.row;
  const points = (standsIn ? cells.slice(1) : cells).map((cell) =>
    cellCentre(cell.column, cell.row, size),
  );
  const first = points[0];
  if (
    standsIn &&
    first !== undefined &&
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
