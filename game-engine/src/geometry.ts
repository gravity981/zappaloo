// Geometry of the isometric world (sw-architecture.md 14.4, GAME-02, GAME-19). Movement and collisions work in
// the map's pixel space, which is the screen space of the map: Tiled stores the objects of an isometric map in
// it, with the origin at the top corner of the map's diamond. Positions on the tile grid convert to it by the
// usual isometric transform (2:1 tiles): a tile corner (x, y) is at pixel ((x - y) · w/2, (x + y) · h/2).

export interface Point {
  x: number;
  y: number;
}

export interface TileSize {
  width: number;
  height: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A position on the tile grid (fractions allowed) to the pixel space of the map. */
export function tileToPixel(tile: Point, size: TileSize): Point {
  return {
    x: ((tile.x - tile.y) * size.width) / 2,
    y: ((tile.x + tile.y) * size.height) / 2,
  };
}

/** The inverse of `tileToPixel`. */
export function pixelToTile(pixel: Point, size: TileSize): Point {
  const a = pixel.x / (size.width / 2);
  const b = pixel.y / (size.height / 2);
  return { x: (a + b) / 2, y: (b - a) / 2 };
}

/** Tiled's isometric object coordinates, to the map pixel space used by Phaser. */
export function tiledToWorld(point: Point, size: TileSize): Point {
  const halfWidth = size.width / 2;
  return tileToPixel({ x: point.x / halfWidth, y: point.y / halfWidth }, size);
}

/** The inverse of `tiledToWorld`. */
export function worldToTiled(point: Point, size: TileSize): Point {
  const tile = pixelToTile(point, size);
  const halfWidth = size.width / 2;
  return { x: tile.x * halfWidth, y: tile.y * halfWidth };
}

/** Tiled's tile-object anchor to world pixels, including its half-tile horizontal anchor offset. */
export function tiledTileObjectToWorld(point: Point, size: TileSize): Point {
  const projected = tiledToWorld(point, size);
  return { x: projected.x + size.width / 2, y: projected.y };
}

/** The inverse of `tiledTileObjectToWorld`. */
export function worldToTiledTileObject(point: Point, size: TileSize): Point {
  return worldToTiled({ x: point.x - size.width / 2, y: point.y }, size);
}

/** The projected bounds of the Tiled raster, relative to the projected tile corner (0, 0). */
export function mapBounds(columns: number, rows: number, size: TileSize): Rectangle {
  return {
    x: -((rows - 1) * size.width) / 2,
    y: 0,
    width: ((columns + rows) * size.width) / 2,
    height: ((columns + rows) * size.height) / 2,
  };
}

/** Whether a point lies inside a closed polygon (even-odd rule). */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** The distance from a point to a line segment. */
export function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

/** The distance from a point to the outline of a closed polygon. */
export function distanceToOutline(point: Point, polygon: readonly Point[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (a === undefined || b === undefined) continue;
    best = Math.min(best, distanceToSegment(point, a, b));
  }
  return best;
}

/** The centre of a polygon's bounding box: a point inside the trigger area of a portal. */
export function polygonCentre(polygon: readonly Point[]): Point {
  const xs = polygon.map((p) => p.x);
  const ys = polygon.map((p) => p.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/**
 * A point inside a polygon, where a tap on a portal walks to (GAME-10). The centre of the bounding box is used when
 * it lies inside; a concave area (an L shape) takes the centroid of a corner's triangle that lies inside, or else the
 * midpoint of an edge moved a pixel towards the centre.
 */
export function interiorPoint(polygon: readonly Point[]): Point {
  const centre = polygonCentre(polygon);
  if (pointInPolygon(centre, polygon)) return centre;
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const a = polygon[(i + n - 1) % n];
    const b = polygon[i];
    const c = polygon[(i + 1) % n];
    if (a === undefined || b === undefined || c === undefined) continue;
    const corner = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    if (pointInPolygon(corner, polygon)) return corner;
  }
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const length = Math.hypot(centre.x - middle.x, centre.y - middle.y);
    if (length === 0) continue;
    const inward = {
      x: middle.x + ((centre.x - middle.x) / length) * 1,
      y: middle.y + ((centre.y - middle.y) / length) * 1,
    };
    if (pointInPolygon(inward, polygon)) return inward;
  }
  return centre;
}

/** The polygon of a rectangle with its top-left corner at (x, y), as Tiled stores rectangles. */
export function rectangleToPolygon(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}
