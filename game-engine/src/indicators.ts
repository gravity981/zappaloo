// The edge indicators (GAME-26): small buttons at the edge of the game view that point towards the usable objects
// and portals outside it. Which objects get one, where it sits and which ones are shown is decided here, in CSS
// pixels of the game view, so that tests can check each rule without Phaser or a browser.
import type { Point } from "./geometry.ts";

/** The distance of an indicator's touch area from the edge of the game view, in CSS pixels. */
export const INDICATOR_INSET = 12;
/** The side of an indicator's touch area, in CSS pixels (at least 44 × 44, for a finger). */
export const INDICATOR_TOUCH_SIZE = 44;
/** The space between an indicator's circle and its label, in CSS pixels. */
export const LABEL_GAP = 6;
/**
 * A label is as wide as its text in the label's font, plus the padding, so that the text stays on one line (story
 * 6.1f, decided 2026-11-20). Only the room in the view bounds it; a text wider than that wraps onto up to
 * `LABEL_MAX_LINES` lines, and only what is beyond those is cut off.
 */
export const LABEL_MAX_LINES = 3;
/** The padding of a label's pill, left and right together. */
export const LABEL_PADDING = 16;
/** The width of one character of a label (12 px semibold), estimated for a place without a browser to measure it. */
const ESTIMATED_CHAR_WIDTH = 6.8;

/** The width in CSS pixels of a text in a label's font. The browser measures it (object-label-layer.ts). */
export type TextMeasure = (text: string) => number;

/** Without a browser: the width of a text estimated from its length. */
export const estimateTextWidth: TextMeasure = (text) =>
  Array.from(text).length * ESTIMATED_CHAR_WIDTH;
/** At most this many indicators are shown at a time. */
export const MAX_INDICATORS = 6;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Whether an object or NPC shows its edge indicator and its label: only its setting `showIndicator` decides, which
 * the admin sets per object and NPC (GAME-26, GAME-41). It is on unless the setting says `false`; an easter egg, an
 * object without an action or an object that shows a dialogue follows the setting like any other.
 */
export function indicatorShown(settings: ReadonlyMap<string, boolean>, key: string): boolean {
  return settings.get(key) ?? true;
}

/** Whether a portal may get an indicator: when it has a target (a portal without one does nothing). */
export function portalWantsIndicator(hasTarget: boolean): boolean {
  return hasTarget;
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
 * The insets for a view whose top part is covered by a bar of `barHeight` pixels. The app's game bar floats over the
 * view and passes its height (the `topInset` option); the game preview has no bar and it is 0.
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

/** The side of its indicator a label is on: the side with more room in the view, so that the label stays inside it. */
export type LabelSide = "left" | "right";

export function labelSide(point: Point, viewWidth: number): LabelSide {
  return point.x > viewWidth / 2 ? "left" : "right";
}

/**
 * The width of a label for a text: the text's width in the label's font plus the padding, and at most what the view
 * leaves beside the indicator. A text wider than that wraps (labelLines); it is not cut off before it.
 */
export function labelWidth(
  text: string,
  point: Point,
  viewWidth: number,
  side: LabelSide,
  measure: TextMeasure = estimateTextWidth,
): number {
  const room =
    (side === "left" ? point.x : viewWidth - point.x) -
    INDICATOR_TOUCH_SIZE / 2 -
    LABEL_GAP -
    INDICATOR_INSET;
  const wanted = Math.ceil(measure(text)) + LABEL_PADDING;
  return Math.max(0, Math.min(wanted, room));
}

/** How many lines a label of this width needs for a text, at most `LABEL_MAX_LINES`. */
export function labelLines(
  text: string,
  width: number,
  measure: TextMeasure = estimateTextWidth,
): number {
  const lines = Math.ceil(measure(text) / Math.max(1, width - LABEL_PADDING));
  return Math.min(LABEL_MAX_LINES, Math.max(1, lines));
}

/** The space an indicator takes in the view: its touch area and its label beside it (0 wide without a label). */
export function indicatorBox(point: Point, side: LabelSide, labelWidth: number): Rect {
  const half = INDICATOR_TOUCH_SIZE / 2;
  const extra = labelWidth > 0 ? LABEL_GAP + labelWidth : 0;
  return {
    x: side === "left" ? point.x - half - extra : point.x - half,
    y: point.y - half,
    width: INDICATOR_TOUCH_SIZE + extra,
    height: INDICATOR_TOUCH_SIZE,
  };
}

/** Whether two boxes overlap. */
export function boxesOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + b.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Whether the touch areas of two indicators overlap. */
export function overlaps(a: Point, b: Point, size = INDICATOR_TOUCH_SIZE): boolean {
  return Math.abs(a.x - b.x) < size && Math.abs(a.y - b.y) < size;
}

/**
 * The indicators to show: the nearest first (by `distance`, the distance of the object from the avatar), at most
 * `max`, and of two whose space (touch area and label) would overlap only the nearer one. The input order does not matter.
 */
export function selectIndicators<T extends { point: Point; distance: number; box?: Rect }>(
  candidates: readonly T[],
  max = MAX_INDICATORS,
): T[] {
  // The space of an indicator is its touch area with its label beside it, where it has a `box`.
  const spaceOf = (item: T): Rect => item.box ?? indicatorBox(item.point, "right", 0);
  const shown: T[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.distance - b.distance)) {
    if (shown.length >= max) break;
    if (shown.some((other) => boxesOverlap(spaceOf(other), spaceOf(candidate)))) continue;
    shown.push(candidate);
  }
  return shown;
}
