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

/** Places the figure in the depth slot that satisfies the most occlusion guides spanning its feet. */
export function figureDepth(feet: Point, occluders: readonly Occluder[]): number {
  const constraints = occluders
    .map((occluder, order) => ({
      depth: occluder.depth,
      order,
      behind: (() => {
        const y = lineY(occluder.line, feet.x);
        return y === undefined ? undefined : feet.y < y;
      })(),
    }))
    .filter((constraint) => constraint.behind !== undefined)
    .sort((a, b) => a.depth - b.depth || a.order - b.order);
  if (constraints.length === 0) return feet.y;

  let bestIndex = 0;
  let bestViolations = Number.POSITIVE_INFINITY;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDepth = feet.y;
  let violations = constraints.filter((constraint) => !constraint.behind).length;
  for (let index = 0; index <= constraints.length; index++) {
    const depth = depthAtSlot(feet.y, constraints, index);
    const distance = Math.abs(depth - feet.y);
    if (
      violations < bestViolations ||
      (violations === bestViolations && distance < bestDistance) ||
      (violations === bestViolations && distance === bestDistance && index > bestIndex)
    ) {
      bestIndex = index;
      bestViolations = violations;
      bestDistance = distance;
      bestDepth = depth;
    }
    const crossed = constraints[index];
    if (crossed !== undefined) violations += crossed.behind ? 1 : -1;
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
