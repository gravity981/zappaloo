// Collisions of a map (sw-architecture.md 14.4, GAME-02): the cells of the `collision` tile layer, collision
// rectangles and polygons (and the collision guides of placed tiles) block their inside; a border blocks its
// outline in both directions while its inside stays walkable. The input point is the figure's feet; its circular
// footprint is centred one radius above that point, so it never extends below the feet.
import {
  distanceToOutline,
  pixelToTile,
  pointInPolygon,
  tileToPixel,
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

/** The player's collision radius, in tile widths (GAME-02). */
export const PLAYER_COLLISION_RADIUS_TILES = 0.1;

/** The sample points of a figure's foot-anchored circle: its centre and points on its edge. */
const CIRCLE_SAMPLES = 8;

function cellKey(column: number, row: number): string {
  return `${String(column)},${String(row)}`;
}

/** Whether a figure with its feet at `point` (in pixel space) would touch a blocked shape. */
export function blocked(obstacles: Obstacles, feet: Point, radius: number): boolean {
  const centre = { x: feet.x, y: feet.y - radius };
  const samples: Point[] = [centre];
  for (let i = 0; i < CIRCLE_SAMPLES; i++) {
    const angle = (i / CIRCLE_SAMPLES) * Math.PI * 2;
    samples.push({
      x: centre.x + Math.cos(angle) * radius,
      y: centre.y + Math.sin(angle) * radius,
    });
  }
  for (const sample of samples) {
    const { column, row } = cellOf(sample, obstacles.size);
    if (column < 0 || row < 0 || column >= obstacles.columns || row >= obstacles.rows) return true;
    if (obstacles.blockedCells.has(cellKey(column, row))) return true;
  }
  for (const solid of obstacles.solids) {
    if (pointInPolygon(centre, solid) || distanceToOutline(centre, solid) < radius) return true;
  }
  for (const border of obstacles.borders) {
    if (distanceToOutline(centre, border) < radius) return true;
  }
  return false;
}

/** Whether a figure with its feet at `feet` may stand there. */
export function walkable(obstacles: Obstacles, feet: Point, radius: number): boolean {
  return !blocked(obstacles, feet, radius);
}

/** The cell of a point in pixel space, as tile column and row. */
/**
 * The cell a point of the screen lies in. The cell (column, row) is the diamond whose centre is the tile corner
 * (column + 1, row), where Phaser draws it: its top corner is the tile corner (column, row).
 */
export function cellOf(point: Point, size: TileSize): { column: number; row: number } {
  const tile = pixelToTile(point, size);
  return { column: Math.floor(tile.x - 0.5), row: Math.floor(tile.y + 0.5) };
}

/** The pixel position of the centre of a cell (see cellOf). */
export function cellCentre(column: number, row: number, size: TileSize): Point {
  return tileToPixel({ x: column + 1, y: row }, size);
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
