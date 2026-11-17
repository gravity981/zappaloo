// The draw order of objects and figures (GAME-19, sw-architecture.md 14.2, 14.4). Objects and figures are sorted by
// depth: an object's depth is the y of its bottom edge, a figure's the y of its feet. A tile object may carry an
// occlusion line (the polyline `occlusion` of its tile): a figure whose feet are behind the line (above it on
// screen) is drawn behind the object, otherwise in front. Without a line, the bottom edge decides.
import type { Point } from "./geometry.ts";

export interface Occluder {
  /** The depth of the object: the y of its bottom edge. */
  depth: number;
  /** The occlusion line in pixel space, sorted by x. */
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

/**
 * The depth a figure is drawn with, given its feet and its own depth (its feet's y). Each occluder whose line
 * spans the figure decides: behind the line, the figure is drawn just behind the object; in front, just in front.
 */
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
