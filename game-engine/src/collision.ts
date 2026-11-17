// Collisions of a map (sw-architecture.md 14.4, GAME-02): the cells of the `collision` tile layer, collision
// rectangles and polygons (and the collision guides of placed tiles) block their inside; a border blocks its
// outline in both directions while its inside stays walkable. The player's collision footprint is an ellipse
// centered 2 pixels left of its logical feet.
import { pixelToTile, pointInPolygon, tileToPixel, type Point, type TileSize } from "./geometry.ts";

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

/** The player's horizontal and vertical collision radii, in tile widths (GAME-02). */
export const PLAYER_COLLISION_RADII_TILES = { x: 0.1, y: 0.05 } as const;
const PLAYER_COLLISION_CENTER_OFFSET = { x: -2, y: 0 } as const;

export interface PlayerCollisionEllipse {
  center: Point;
  radiusX: number;
  radiusY: number;
}

export function playerCollisionEllipse(feet: Point, tileWidth: number): PlayerCollisionEllipse {
  return {
    center: {
      x: feet.x + PLAYER_COLLISION_CENTER_OFFSET.x,
      y: feet.y + PLAYER_COLLISION_CENTER_OFFSET.y,
    },
    radiusX: tileWidth * PLAYER_COLLISION_RADII_TILES.x,
    radiusY: tileWidth * PLAYER_COLLISION_RADII_TILES.y,
  };
}

/** The sample points of the player's collision ellipse. */
const ELLIPSE_SAMPLES = 16;

function cellKey(column: number, row: number): string {
  return `${String(column)},${String(row)}`;
}

function distanceToEllipseOutline(
  ellipse: PlayerCollisionEllipse,
  polygon: readonly Point[],
): number {
  const { center, radiusX, radiusY } = ellipse;
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const start = polygon[i];
    const end = polygon[(i + 1) % polygon.length];
    if (start === undefined || end === undefined) continue;

    const ax = (start.x - center.x) / radiusX;
    const ay = (start.y - center.y) / radiusY;
    const dx = (end.x - start.x) / radiusX;
    const dy = (end.y - start.y) / radiusY;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
    minimum = Math.min(minimum, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return minimum;
}

/** Whether the player's collision ellipse touches a blocked shape. */
export function blocked(obstacles: Obstacles, ellipse: PlayerCollisionEllipse): boolean {
  const { center, radiusX, radiusY } = ellipse;
  const samples: Point[] = [center];
  for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
    const angle = (i / ELLIPSE_SAMPLES) * Math.PI * 2;
    samples.push({
      x: center.x + Math.cos(angle) * radiusX,
      y: center.y + Math.sin(angle) * radiusY,
    });
  }
  for (const sample of samples) {
    const { column, row } = cellOf(sample, obstacles.size);
    if (column < 0 || row < 0 || column >= obstacles.columns || row >= obstacles.rows) return true;
    if (obstacles.blockedCells.has(cellKey(column, row))) return true;
  }
  for (const solid of obstacles.solids) {
    if (pointInPolygon(center, solid) || distanceToEllipseOutline(ellipse, solid) < 1) return true;
  }
  for (const border of obstacles.borders) {
    if (distanceToEllipseOutline(ellipse, border) < 1) return true;
  }
  return false;
}

/** Whether the player may stand at the feet position described by this collision ellipse. */
export function walkable(obstacles: Obstacles, ellipse: PlayerCollisionEllipse): boolean {
  return !blocked(obstacles, ellipse);
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
  tileWidth: number,
  step: number,
): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const parts = Math.max(1, Math.ceil(length / step));
  for (let i = 1; i <= parts; i++) {
    const t = i / parts;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (blocked(obstacles, playerCollisionEllipse(point, tileWidth))) return false;
  }
  return true;
}
