// Clickable objects in play (sw-architecture.md 14.2, GAME-06, GAME-15, GAME-16): which object a tap or press
// means, where the avatar stops, and when it has arrived. Pure: it reads the parsed map and points.
import type { WorldObjectAction } from "@zappaloo/shared";
import { distanceToOutline, pointInPolygon, type Point } from "./geometry.ts";
import type { ClickableArea, ParsedMap } from "./map-model.ts";

/** How far beside an object a tap still means it, in pixels: small objects are hard to hit with a finger. */
export const TAP_TOLERANCE = 12;

/** The distance of a point from an object's shape: 0 inside it. */
export function distanceTo(area: ClickableArea, point: Point): number {
  return pointInPolygon(point, area.polygon) ? 0 : distanceToOutline(point, area.polygon);
}

/** The clickable object a tap at the point means: the nearest one within the tolerance (GAME-16). */
export function clickableAt(map: ParsedMap, point: Point): ClickableArea | undefined {
  let best: ClickableArea | undefined;
  let bestDistance = TAP_TOLERANCE;
  for (const area of map.clickables) {
    const distance = distanceTo(area, point);
    if (distance <= bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The clickable object in front of the avatar, for Enter or Space (GAME-16): the nearest one whose shape is
 * within one tile width of the avatar's feet.
 */
export function clickableInReach(map: ParsedMap, feet: Point): ClickableArea | undefined {
  const reach = map.size.width;
  let best: ClickableArea | undefined;
  let bestDistance = reach;
  for (const area of map.clickables) {
    const distance = Math.min(
      distanceTo(area, feet),
      Math.hypot(area.approach.x - feet.x, area.approach.y - feet.y),
    );
    if (distance <= bestDistance) {
      best = area;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Whether a walk to an object has ended where the action may run: at the approach point, or, when something
 * blocked the way, still within one tile width of the object itself.
 */
export function arrivedAt(map: ParsedMap, area: ClickableArea, feet: Point): boolean {
  const reach = map.size.width;
  return (
    Math.hypot(area.approach.x - feet.x, area.approach.y - feet.y) <= reach ||
    distanceTo(area, feet) <= reach
  );
}

/**
 * What activating the object does: the admin's assignment (by `map/object`), or the preset of the Tiled file
 * (MAP-15). An object without either does nothing.
 */
export function actionOf(
  actions: ReadonlyMap<string, WorldObjectAction>,
  mapId: string,
  area: ClickableArea,
): WorldObjectAction {
  return actions.get(`${mapId}/${area.name}`) ?? area.preset ?? { kind: "none" };
}

/** At most this many sparkles are visible at the same time (GAME-15). */
export const MAX_SPARKLES = 5;

/** The random time in milliseconds until the next sparkle appears (GAME-15): 0.15 to 0.45 seconds. */
export function nextSparkleDelay(random: () => number = Math.random): number {
  return 150 + random() * 300;
}

/** The random time in milliseconds until a shine passes over an object (GAME-15): 3 to 7 seconds. */
export function nextShineDelay(random: () => number = Math.random): number {
  return 3000 + random() * 4000;
}

/**
 * The gradient of a shine at `progress` (0 to 1) of its sweep over a picture of the given size (GAME-15): a
 * diagonal band of light, as the start and end of a linear gradient, that is wholly before the picture at 0 and
 * wholly behind it at 1. The band is painted only where the picture is opaque, so transparent pixels stay dark.
 */
export function shineGradient(
  width: number,
  height: number,
  progress: number,
): { x0: number; y0: number; x1: number; y1: number } {
  // The axis of the sweep runs left to right and down, so the band stands slanted.
  const axis = { x: Math.cos(Math.PI / 6), y: Math.sin(Math.PI / 6) };
  const length = width * axis.x + height * axis.y;
  const band = Math.max(8, width * 0.3);
  const centre = -band + (length + 2 * band) * progress;
  return {
    x0: axis.x * (centre - band),
    y0: axis.y * (centre - band),
    x1: axis.x * (centre + band),
    y1: axis.y * (centre + band),
  };
}

/**
 * The visible edge of a picture (GAME-15): the opaque pixels, sampled every `step` pixels, that have a transparent
 * pixel (or the border of the picture) one step beside them. Sparkles appear only on these, never on transparent
 * pixels. `alphaAt` gives the alpha (0 to 255) of a pixel of the picture.
 */
export function visibleEdge(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number,
  step = 2,
  threshold = 128,
): Point[] {
  const opaque = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && alphaAt(x, y) >= threshold;
  const edge: Point[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (!opaque(x, y)) continue;
      if (
        !opaque(x - step, y) ||
        !opaque(x + step, y) ||
        !opaque(x, y - step) ||
        !opaque(x, y + step)
      ) {
        edge.push({ x, y });
      }
    }
  }
  return edge;
}
