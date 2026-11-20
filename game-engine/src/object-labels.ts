// The labels that stick to objects in sight (GAME-41; decision 14 of epic 6): once an object, portal or NPC with an
// edge indicator comes into view, its indicator goes and its name sticks to the top of it, the same white pill as
// the indicator's label. Where a label stands and which of several are shown is decided here, in CSS pixels of the
// game view, so that tests can check each rule without Phaser or a browser.
import {
  LABEL_MAX_LINES,
  boxesOverlap,
  estimateTextWidth,
  type Rect,
  type TextMeasure,
} from "./indicators.ts";
import type { Point } from "./geometry.ts";

/** The height of a label's pill of one line, and the space between its bottom and the top of the object, in CSS pixels. */
export const OBJECT_LABEL_HEIGHT = 22;
/** What each further line of a label adds to its height. */
const OBJECT_LABEL_LINE = 16;
export const OBJECT_LABEL_GAP = 4;
/** The least space between a label and the edge of the view. */
export const OBJECT_LABEL_MARGIN = 4;
/** The padding of the pill, left and right together (2 px top and bottom, 8 px at each side in the stylesheet). */
const PADDING = 16;

/**
 * The width of a label for a text: the width of the text in the label's font plus the padding, so that the text fits
 * on one line. Only the view bounds it: a text wider than the view wraps (objectLabelHeight) and is not cut off.
 */
export function objectLabelWidth(
  text: string,
  viewWidth = Number.POSITIVE_INFINITY,
  measure: TextMeasure = estimateTextWidth,
): number {
  const room = Math.max(PADDING + 4 * 6.8, viewWidth - 2 * OBJECT_LABEL_MARGIN);
  return Math.min(Math.ceil(measure(text)) + PADDING, room);
}

/** The height of a label for a text at a width: one line is 22 pixels, each further line adds 16 (up to three lines). */
export function objectLabelHeight(
  text: string,
  width: number,
  measure: TextMeasure = estimateTextWidth,
): number {
  const lines = Math.min(
    LABEL_MAX_LINES,
    Math.max(1, Math.ceil(measure(text) / Math.max(1, width - PADDING))),
  );
  return OBJECT_LABEL_HEIGHT + (lines - 1) * OBJECT_LABEL_LINE;
}

/**
 * The box of a label: centred above `top` (the top centre of the object in the view), moved sideways to stay inside
 * the view, and not above its top edge.
 */
export function objectLabelBox(
  top: Point,
  width: number,
  view: { width: number; height: number },
  height = OBJECT_LABEL_HEIGHT,
): Rect {
  const left = OBJECT_LABEL_MARGIN;
  const right = Math.max(left, view.width - OBJECT_LABEL_MARGIN - width);
  return {
    x: Math.min(right, Math.max(left, top.x - width / 2)),
    y: Math.max(OBJECT_LABEL_MARGIN, top.y - OBJECT_LABEL_GAP - height),
    width,
    height,
  };
}

export interface ObjectLabelCandidate {
  id: string;
  /** The distance of the object from the avatar in map pixels. */
  distance: number;
  box: Rect;
}

/** The labels to show: the nearest object's first, and of two that would overlap only the nearer. */
export function chooseObjectLabels(candidates: readonly ObjectLabelCandidate[]): string[] {
  const shown: ObjectLabelCandidate[] = [];
  for (const candidate of [...candidates].sort((a, b) => a.distance - b.distance)) {
    if (shown.some((other) => boxesOverlap(other.box, candidate.box))) continue;
    shown.push(candidate);
  }
  return shown.map((candidate) => candidate.id);
}
