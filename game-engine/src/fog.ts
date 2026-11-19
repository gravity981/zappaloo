// The fog at the end of the world (GAME-33; sw-architecture.md 3.5, 14.2): it lies along the map's border polygons. Inside
// a border the view is clear; outside it the fog thickens over about two tile widths and then covers everything,
// the foreground layers included, so the player sees where the world ends. The map is worked out once as a coarse
// raster of the fog's opacity, which is drawn smoothed over the map.
import { distanceToOutline, pointInPolygon, type Point, type Rectangle } from "./geometry.ts";

/** The fog thickens over this many tile widths outside the border. */
export const FOG_FADE_TILES = 2;
/** The colour of the fog: a light mist. */
export const FOG_COLOUR = { r: 223, g: 230, b: 233 } as const;
/** The raster's cell, in map pixels: the fog is soft, so a coarse raster is enough. */
export const FOG_CELL = 8;

/** Whether a point lies inside any of the border polygons (the walkable inside of the world). */
export function insideBorders(point: Point, borders: readonly (readonly Point[])[]): boolean {
  return borders.some((polygon) => pointInPolygon(point, polygon));
}

/** The distance of a point from the nearest border polygon; 0 inside one. Infinite without borders. */
export function distanceOutsideBorders(
  point: Point,
  borders: readonly (readonly Point[])[],
): number {
  if (insideBorders(point, borders)) return 0;
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...borders.map((polygon) => distanceToOutline(point, polygon)),
  );
}

/** The opacity of the fog `distance` pixels outside the border: 0 at the border, 1 from the fade length on, smooth between. */
export function fogOpacity(distance: number, tileWidth: number): number {
  const length = FOG_FADE_TILES * tileWidth;
  if (distance <= 0) return 0;
  if (distance >= length) return 1;
  const t = distance / length;
  return t * t * (3 - 2 * t);
}

export interface FogRaster {
  /** The map rectangle the raster covers, in map pixels (the map's bounds and the fade around them). */
  area: Rectangle;
  columns: number;
  rows: number;
  /** The opacity of every cell, 0 to 255, row by row. */
  alpha: Uint8ClampedArray;
}

/**
 * The fog over a map as a raster. The area is the map's bounds with the fade length around them, so the fog is
 * complete wherever the camera can look. The opacity of a cell is the one of its centre.
 */
export function fogRaster(
  bounds: Rectangle,
  borders: readonly (readonly Point[])[],
  tileWidth: number,
  cell: number = FOG_CELL,
): FogRaster {
  const margin = FOG_FADE_TILES * tileWidth;
  const area = {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + 2 * margin,
    height: bounds.height + 2 * margin,
  };
  const columns = Math.ceil(area.width / cell);
  const rows = Math.ceil(area.height / cell);
  const alpha = new Uint8ClampedArray(columns * rows);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const centre = { x: area.x + (column + 0.5) * cell, y: area.y + (row + 0.5) * cell };
      const distance = distanceOutsideBorders(centre, borders);
      alpha[row * columns + column] = Math.round(fogOpacity(distance, tileWidth) * 255);
    }
  }
  return { area, columns, rows, alpha };
}
