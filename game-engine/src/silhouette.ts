// Silhouettes of figures behind objects (GAME-42): the arithmetic, without Phaser. The scene lays points on a figure,
// asks which of them an object in front covers, and shows a flat silhouette above the objects when enough are covered.
import type { Point } from "./geometry.ts";

/** A figure shows its silhouette when more than this share of it is covered. */
export const SILHOUETTE_SHARE = 2 / 3;
export const SILHOUETTE_OPACITY = 0.5;

/** The most points laid on one figure: enough for a share to 1/24, cheap enough for a phone every frame. */
export const MAX_SAMPLES = 24;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What is in front of the figures: a picture with its place in the depth order and the opacity of its pixels. */
export interface Cover {
  /** Where the picture is drawn, in map pixels. */
  bounds: Rect;
  /** The depth it is drawn at; it covers the figures whose depth is lower. */
  depth: number;
  /** Whether the pixel of the picture at a map point is not transparent. */
  opaqueAt: (x: number, y: number) => boolean;
}

const BUCKET = 128;

/** The covers, in a grid of buckets so that a point only meets the pictures that are near it. */
export class CoverIndex {
  readonly #buckets = new Map<string, Cover[]>();

  constructor(covers: readonly Cover[]) {
    for (const cover of covers) {
      const { x, y, width, height } = cover.bounds;
      for (
        let column = Math.floor(x / BUCKET);
        column <= Math.floor((x + width) / BUCKET);
        column++
      ) {
        for (let row = Math.floor(y / BUCKET); row <= Math.floor((y + height) / BUCKET); row++) {
          const key = bucketKey(column, row);
          const bucket = this.#buckets.get(key);
          if (bucket === undefined) this.#buckets.set(key, [cover]);
          else bucket.push(cover);
        }
      }
    }
  }

  /** Whether a picture drawn above `depth` has an opaque pixel at the point. */
  covers(point: Point, depth: number): boolean {
    const bucket = this.#buckets.get(
      bucketKey(Math.floor(point.x / BUCKET), Math.floor(point.y / BUCKET)),
    );
    if (bucket === undefined) return false;
    for (const cover of bucket) {
      if (cover.depth <= depth) continue;
      const { x, y, width, height } = cover.bounds;
      if (point.x < x || point.y < y || point.x >= x + width || point.y >= y + height) continue;
      if (cover.opaqueAt(point.x, point.y)) return true;
    }
    return false;
  }
}

function bucketKey(column: number, row: number): string {
  return `${String(column)},${String(row)}`;
}

/** The share of the points that are covered; a figure without points is not covered. */
export function coveredShare(
  points: readonly Point[],
  isCovered: (point: Point) => boolean,
): number {
  if (points.length === 0) return 0;
  let covered = 0;
  for (const point of points) if (isCovered(point)) covered += 1;
  return covered / points.length;
}

/** How much of a thing has to be covered for its silhouette to show. */
export type SilhouetteRule = "mostly" | "whole" | "any";

export function silhouetteShows(share: number, rule: SilhouetteRule): boolean {
  if (rule === "any") return share > 0;
  if (rule === "whole") return share >= 1;
  return share > SILHOUETTE_SHARE;
}

/**
 * At most `MAX_SAMPLES` of the points, evenly picked, so that the cost does not grow with the size of the picture
 * while the share they give stays true to it.
 */
export function thinOut<T>(points: readonly T[], max = MAX_SAMPLES): T[] {
  if (points.length <= max) return [...points];
  const picked: T[] = [];
  for (let index = 0; index < max; index++) {
    const point = points[Math.floor(((index + 0.5) * points.length) / max)];
    if (point !== undefined) picked.push(point);
  }
  return picked;
}

/** The points of a picture whose pixel is opaque, on a lattice of `step` pixels, thinned out. Relative to its corner. */
export function opaquePoints(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
  step = 3,
  threshold = 32,
): Point[] {
  const points: Point[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (alphaAt(x, y) >= threshold) points.push({ x, y });
    }
  }
  return thinOut(points);
}

/** Points on the outline of an ellipse (the target marker), for the same measuring. */
export function ellipsePoints(
  centre: Point,
  radiusX: number,
  radiusY: number,
  count = 12,
): Point[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return { x: centre.x + Math.cos(angle) * radiusX, y: centre.y + Math.sin(angle) * radiusY };
  });
}
