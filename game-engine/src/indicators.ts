// The edge indicators (GAME-26): small buttons at the edge of the game view that point towards the usable objects
// and portals outside it. Which objects get one, where it sits and which ones are shown is decided here, in CSS
// pixels of the game view, so that tests can check each rule without Phaser or a browser.
import type { Point } from "./geometry.ts";

/** The distance of an indicator's touch area from the edge of the game view, in CSS pixels. */
export const INDICATOR_INSET = 12;
/** The side of an indicator's touch area, in CSS pixels (at least 44 × 44, for a finger). */
export const INDICATOR_TOUCH_SIZE = 44;
/** At most this many indicators are shown at a time. */
export const MAX_INDICATORS = 6;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What an object is, as far as an indicator is concerned. */
export type IndicatorTarget =
  { kind: "object"; hidden: boolean; hasAction: boolean } | { kind: "portal"; hasTarget: boolean };

/**
 * Whether an object may get an indicator: a clickable object with an action assigned, or a portal with a target.
 * Easter eggs (GAME-08) and objects without an action get none. With `anyObject` (the game preview, which cannot
 * assign actions), every clickable object but an easter egg gets one.
 */
export function wantsIndicator(target: IndicatorTarget, anyObject = false): boolean {
  if (target.kind === "portal") return target.hasTarget;
  return !target.hidden && (target.hasAction || anyObject);
}

/** Whether the bounds of an object lie entirely outside the view (both in world pixels). */
export function isOutside(bounds: Rect, view: Rect): boolean {
  return (
    bounds.x + bounds.width < view.x ||
    bounds.x > view.x + view.width ||
    bounds.y + bounds.height < view.y ||
    bounds.y > view.y + view.height
  );
}

/** How far the centre of an indicator is from the edge of the view on each side, in CSS pixels. */
export interface IndicatorInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The insets for a view whose top part is covered by a bar of `barHeight` pixels. Where the bar is a sibling above
 * the canvas, as in the app, the view starts below it and \`barHeight\` is 0.
 */
export function indicatorInsets(barHeight = 0): IndicatorInsets {
  const centre = INDICATOR_INSET + INDICATOR_TOUCH_SIZE / 2;
  return { left: centre, right: centre, top: barHeight + centre, bottom: centre };
}

export interface IndicatorPlace {
  /** Where the indicator's centre lies in the view. */
  point: Point;
  /** The direction to the object, in radians, 0 being to the right and positive turning down (screen directions). */
  angle: number;
}

/**
 * Where the indicator of an object sits: on the line from the avatar to the object, where it leaves the area the
 * indicators may be in (the view, less the insets). `avatar` and `object` are points of the view in CSS pixels. An
 * avatar that stands outside that area (right at the edge) has the object's point moved into the area instead.
 */
export function indicatorPlace(
  avatar: Point,
  object: Point,
  view: { width: number; height: number },
  insets: IndicatorInsets = indicatorInsets(),
): IndicatorPlace {
  const left = insets.left;
  const right = view.width - insets.right;
  const top = insets.top;
  const bottom = view.height - insets.bottom;
  const angle = Math.atan2(object.y - avatar.y, object.x - avatar.x);
  const clamp = (point: Point): Point => ({
    x: Math.min(Math.max(point.x, left), right),
    y: Math.min(Math.max(point.y, top), bottom),
  });
  const dx = object.x - avatar.x;
  const dy = object.y - avatar.y;
  const inside = avatar.x >= left && avatar.x <= right && avatar.y >= top && avatar.y <= bottom;
  if (!inside || (dx === 0 && dy === 0)) return { point: clamp(object), angle };
  // The ray leaves the area where its parameter t is the smallest positive one of the four edges.
  let t = Number.POSITIVE_INFINITY;
  if (dx > 0) t = Math.min(t, (right - avatar.x) / dx);
  if (dx < 0) t = Math.min(t, (left - avatar.x) / dx);
  if (dy > 0) t = Math.min(t, (bottom - avatar.y) / dy);
  if (dy < 0) t = Math.min(t, (top - avatar.y) / dy);
  return { point: { x: avatar.x + dx * t, y: avatar.y + dy * t }, angle };
}

/** Whether the touch areas of two indicators overlap. */
export function overlaps(a: Point, b: Point, size = INDICATOR_TOUCH_SIZE): boolean {
  return Math.abs(a.x - b.x) < size && Math.abs(a.y - b.y) < size;
}

/**
 * The indicators to show: the nearest first (by `distance`, the distance of the object from the avatar), at most
 * `max`, and of two that would overlap only the nearer one. The input order does not matter.
 */
export function selectIndicators<T extends { point: Point; distance: number }>(
  candidates: readonly T[],
  max = MAX_INDICATORS,
): T[] {
  const shown: T[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.distance - b.distance)) {
    if (shown.length >= max) break;
    if (shown.some((other) => overlaps(other.point, candidate.point))) continue;
    shown.push(candidate);
  }
  return shown;
}
