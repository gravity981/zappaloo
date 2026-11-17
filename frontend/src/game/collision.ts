// Collisions of a map (sw-architecture.md 14.4, GAME-02): the cells of the `collision` tile layer, collision
// rectangles and polygons (and the collision guides of placed tiles) block their inside; a border blocks its
// outline in both directions while its inside stays walkable. A guest's figure is a circle of a given radius,
// so it cannot touch a blocked shape either.
import {
  distanceToOutline,
  pixelToTile,
  pointInPolygon,
  type Point,
  type TileSize,
} from "./geometry.ts";

export interface Obstacles {
  size: TileSize;
  /** The map's size in tiles. Outside the map everything is blocked. */
  columns: number;
  rows: number;
  /** The cells (`"column,row"`) that the collision tile layer blocks. */
  blockedCells: ReadonlySet<string>;
  /** Closed polygons whose inside blocks. */
  solids: readonly (readonly Point[])[];
  /** Closed polygons whose outline blocks; their inside is walkable. */
  borders: readonly (readonly Point[])[];
}

/** The sample points of a figure's circle: its centre and points on its edge. */
const CIRCLE_SAMPLES = 8;

function cellKey(column: number, row: number): string {
  return `${String(column)},${String(row)}`;
}

/** Whether a figure of `radius` standing at `point` (in pixel space) would touch a blocked shape. */
export function blocked(obstacles: Obstacles, point: Point, radius: number): boolean {
  const samples: Point[] = [point];
  for (let i = 0; i < CIRCLE_SAMPLES; i++) {
    const angle = (i / CIRCLE_SAMPLES) * Math.PI * 2;
    samples.push({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius });
  }
  for (const sample of samples) {
    const tile = pixelToTile(sample, obstacles.size);
    const column = Math.floor(tile.x);
    const row = Math.floor(tile.y);
    if (column < 0 || row < 0 || column >= obstacles.columns || row >= obstacles.rows) return true;
    if (obstacles.blockedCells.has(cellKey(column, row))) return true;
  }
  for (const solid of obstacles.solids) {
    if (pointInPolygon(point, solid) || distanceToOutline(point, solid) < radius) return true;
  }
  for (const border of obstacles.borders) {
    if (distanceToOutline(point, border) < radius) return true;
  }
  return false;
}

/** Whether a figure of `radius` may stand at `point`. */
export function walkable(obstacles: Obstacles, point: Point, radius: number): boolean {
  return !blocked(obstacles, point, radius);
}

/** The cell of a point in pixel space, as tile column and row. */
export function cellOf(point: Point, size: TileSize): { column: number; row: number } {
  const tile = pixelToTile(point, size);
  return { column: Math.floor(tile.x), row: Math.floor(tile.y) };
}

/** Whether the segment from `a` to `b` is free of obstacles, sampled every `step` pixels. */
export function clearLine(
  obstacles: Obstacles,
  a: Point,
  b: Point,
  radius: number,
  step: number,
): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const parts = Math.max(1, Math.ceil(length / step));
  for (let i = 1; i <= parts; i++) {
    const t = i / parts;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (blocked(obstacles, point, radius)) return false;
  }
  return true;
}
