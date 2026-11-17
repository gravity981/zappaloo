import type { Point } from "./geometry.ts";
import { playerCollisionEllipse } from "./collision.ts";

export interface Occluder {
  /** The depth of the object: the y of its bottom edge. */
  depth: number;
  /**
   * The picture of the object in world pixels. Only an object whose picture overlaps the figure on the screen decides
   * where the figure is drawn; without bounds, the object always does.
   */
  bounds?: { x: number; y: number; width: number; height: number };
  /** The occlusion polyline in world pixel coordinates. */
  line: readonly Point[];
}

export interface FigureOcclusionSegment {
  start: Point;
  end: Point;
  center: Point;
}

export interface OcclusionSegmentRelation {
  behind: boolean;
  sample: Point;
  intersections: Point[];
}

/** The horizontal diameter of the player's collision ellipse, used for actor occlusion. */
export function figureOcclusionSegment(feet: Point, tileWidth: number): FigureOcclusionSegment {
  const { center, radiusX } = playerCollisionEllipse(feet, tileWidth);
  return {
    start: { x: center.x - radiusX, y: center.y },
    end: { x: center.x + radiusX, y: center.y },
    center,
  };
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

/** Measures which side of an occlusion line contains more of the horizontal actor segment. */
export function occlusionSegmentRelation(
  segment: FigureOcclusionSegment,
  line: readonly Point[],
): OcclusionSegmentRelation | undefined {
  const left = segment.start.x;
  const right = segment.end.x;
  const intersections = horizontalIntersections(line, segment, left, right);
  const breakpoints = [
    left,
    right,
    ...line.map((point) => point.x).filter((x) => x > left && x < right),
    ...intersections.map((point) => point.x).filter((x) => x > left && x < right),
  ].sort((a, b) => a - b);
  let behindLength = 0;
  let frontLength = 0;
  let longestInterval = 0;
  let sampleX: number | undefined;

  for (let index = 0; index + 1 < breakpoints.length; index++) {
    const start = breakpoints[index];
    const end = breakpoints[index + 1];
    if (start === undefined || end === undefined || end <= start) continue;

    const midpoint = (start + end) / 2;
    const y = lineY(line, midpoint);
    if (y === undefined) continue;

    const length = end - start;
    if (segment.center.y < y) behindLength += length;
    else frontLength += length;

    if (length > longestInterval) {
      longestInterval = length;
      sampleX = midpoint;
    }
  }

  if (longestInterval === 0) {
    const y = lineY(line, segment.center.x);
    if (y === undefined) return undefined;
    return {
      behind: segment.center.y < y,
      sample: { x: segment.center.x, y },
      intersections,
    };
  }

  const centerY = lineY(line, segment.center.x);
  const x = centerY === undefined ? sampleX : segment.center.x;
  if (x === undefined) return undefined;
  const y = lineY(line, x);
  if (y === undefined) return undefined;

  return {
    behind: behindLength > frontLength,
    sample: { x, y },
    intersections,
  };
}

function horizontalIntersections(
  line: readonly Point[],
  segment: FigureOcclusionSegment,
  left: number,
  right: number,
): Point[] {
  const intersections: Point[] = [];
  for (let index = 0; index + 1 < line.length; index++) {
    const a = line[index];
    const b = line[index + 1];
    if (a === undefined || b === undefined) continue;

    if (a.y === b.y) {
      if (a.y !== segment.center.y) continue;
      const overlapStart = Math.max(left, Math.min(a.x, b.x));
      const overlapEnd = Math.min(right, Math.max(a.x, b.x));
      if (overlapStart <= overlapEnd) {
        intersections.push({ x: overlapStart, y: segment.center.y });
        if (overlapEnd !== overlapStart) intersections.push({ x: overlapEnd, y: segment.center.y });
      }
      continue;
    }

    const t = (segment.center.y - a.y) / (b.y - a.y);
    if (t < 0 || t > 1) continue;
    const x = a.x + t * (b.x - a.x);
    if (x >= left && x <= right) intersections.push({ x, y: segment.center.y });
  }

  return intersections.filter(
    (point, index) =>
      intersections.findIndex(
        (candidate) =>
          Math.abs(candidate.x - point.x) < 1e-6 && Math.abs(candidate.y - point.y) < 1e-6,
      ) === index,
  );
}

/**
 * The part of the screen the figure covers, from its feet: as wide as a tile and as high as the figure's picture is
 * (about a tile and a half) and a little more, which is more than the figure's own pixels.
 */
export function figureBounds(
  feet: Point,
  tileWidth: number,
): { x: number; y: number; width: number; height: number } {
  return {
    x: feet.x - tileWidth / 2,
    y: feet.y - tileWidth,
    width: tileWidth,
    height: tileWidth + 4,
  };
}

/** Whether the object's picture overlaps what the figure covers; an object without bounds always does. */
function overlapsFigure(occluder: Occluder, feet: Point, tileWidth: number): boolean {
  const box = occluder.bounds;
  if (box === undefined) return true;
  const figure = figureBounds(feet, tileWidth);
  return (
    box.x < figure.x + figure.width &&
    box.x + box.width > figure.x &&
    box.y < figure.y + figure.height &&
    box.y + box.height > figure.y
  );
}

/**
 * What it costs when a guide is broken. A guide that says the figure stands in front of an object, and is broken, draws
 * the figure behind the object: it is hidden. A guide that says the figure stands behind an object, and is broken,
 * draws the figure over the object: it overlaps it a little, which is far less bad.
 */
const HIDDEN_COST = 2;
const OVERLAP_COST = 1;

/**
 * Places the figure in the depth slot that breaks the fewest occlusion guides, a guide that would hide the figure
 * counting double. This matters where the guides contradict each other: a small prop in front of a building stands
 * higher on the screen than the building's lowest edge, so its depth is lower, and no slot puts the figure in front
 * of the building and behind the prop. The figure is then drawn over the prop, not behind the building.
 */
export function figureDepth(
  feet: Point,
  occluders: readonly Occluder[],
  tileWidth: number,
): number {
  const segment = figureOcclusionSegment(feet, tileWidth);
  // An object whose picture the figure does not overlap on the screen cannot hide the figure or be hidden by it, so
  // it does not take part: otherwise a big bush that lies below the figure would push it behind a building.
  const constraints = occluders
    .map((occluder, order) => ({ occluder, order }))
    .filter(({ occluder }) => overlapsFigure(occluder, feet, tileWidth))
    .map(({ occluder, order }) => ({
      depth: occluder.depth,
      order,
      behind: occlusionSegmentRelation(segment, occluder.line)?.behind,
    }))
    .filter((constraint) => constraint.behind !== undefined)
    .sort((a, b) => a.depth - b.depth || a.order - b.order);
  if (constraints.length === 0) return feet.y;

  let bestIndex = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDepth = feet.y;
  // At the lowest slot, every guide that puts the figure in front of its object is broken.
  let cost = constraints.filter((constraint) => !constraint.behind).length * HIDDEN_COST;
  for (let index = 0; index <= constraints.length; index++) {
    const depth = depthAtSlot(feet.y, constraints, index);
    const distance = Math.abs(depth - feet.y);
    if (
      cost < bestCost ||
      (cost === bestCost && distance < bestDistance) ||
      (cost === bestCost && distance === bestDistance && index > bestIndex)
    ) {
      bestIndex = index;
      bestCost = cost;
      bestDistance = distance;
      bestDepth = depth;
    }
    const crossed = constraints[index];
    if (crossed !== undefined) cost += crossed.behind ? OVERLAP_COST : -HIDDEN_COST;
  }
  return bestDepth;
}

function depthAtSlot(
  feetY: number,
  constraints: readonly { depth: number }[],
  index: number,
): number {
  const before = constraints[index - 1];
  const after = constraints[index];
  if (before === undefined) return Math.min(feetY, (after?.depth ?? feetY) - 0.5);
  if (after === undefined) return Math.max(feetY, before.depth + 0.5);

  const low = before.depth + 0.5;
  const high = after.depth - 0.5;
  if (low <= high) return Math.max(low, Math.min(high, feetY));
  if (before.depth === after.depth) return before.depth + 0.000001;
  return (before.depth + after.depth) / 2;
}
