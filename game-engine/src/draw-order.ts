import type { Point } from "./geometry.ts";

export interface Occluder {
  /** The depth of the object: the y of its bottom edge. */
  depth: number;
  /** The occlusion polyline in world pixel coordinates. */
  line: readonly Point[];
}

/** The y of an occlusion line at `x`, or undefined when the line does not span `x`. */
export function lineY(line: readonly Point[], x: number): number | undefined {
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    if (a === undefined || b === undefined) continue;
    const from = Math.min(a.x, b.x);
    const to = Math.max(a.x, b.x);
    if (x < from || x > to) continue;
    if (a.x === b.x) return Math.min(a.y, b.y);
    const t = (x - a.x) / (b.x - a.x);
    return a.y + t * (b.y - a.y);
  }
  return undefined;
}

/** Places the figure immediately behind or in front of every occluder whose line spans its feet. */
export function figureDepth(feet: Point, occluders: readonly Occluder[]): number {
  let depth = feet.y;
  for (const occluder of occluders) {
    const y = lineY(occluder.line, feet.x);
    if (y === undefined) continue;
    if (feet.y < y) depth = Math.min(depth, occluder.depth - 0.5);
    else depth = Math.max(depth, occluder.depth + 0.5);
  }
  return depth;
}
