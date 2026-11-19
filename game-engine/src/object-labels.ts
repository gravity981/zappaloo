// The labels that stick to objects in sight (GAME-41; decision 14 of epic 6): once an object, portal or NPC with an
// edge indicator comes into view, its indicator goes and its name sticks to the top of it, the same white pill as
// the indicator's label. Where a label stands and which of several are shown is decided here, in CSS pixels of the
// game view, so that tests can check each rule without Phaser or a browser.
import { LABEL_MAX_WIDTH, boxesOverlap, type Rect } from "./indicators.ts";
import type { Point } from "./geometry.ts";

/** The height of a label's pill, and the space between its bottom and the top of the object, in CSS pixels. */
export const OBJECT_LABEL_HEIGHT = 22;
export const OBJECT_LABEL_GAP = 4;
/** The least space between a label and the edge of the view. */
export const OBJECT_LABEL_MARGIN = 4;
/** The width of one character of a label (12 px semibold), estimated, and the padding of the pill. */
const CHAR_WIDTH = 6.8;
const PADDING = 16;

/** The width of a label for a text: estimated from its length, and at most the width of an indicator's label. */
export function objectLabelWidth(text: string): number {
  return Math.min(Math.ceil(Array.from(text).length * CHAR_WIDTH) + PADDING, LABEL_MAX_WIDTH);
}

/**
 * The box of a label: centred above `top` (the top centre of the object in the view), moved sideways to stay inside
 * the view, and not above its top edge.
 */
export function objectLabelBox(
  top: Point,
  width: number,
  view: { width: number; height: number },
): Rect {
  const left = OBJECT_LABEL_MARGIN;
  const right = Math.max(left, view.width - OBJECT_LABEL_MARGIN - width);
  return {
    x: Math.min(right, Math.max(left, top.x - width / 2)),
    y: Math.max(OBJECT_LABEL_MARGIN, top.y - OBJECT_LABEL_GAP - OBJECT_LABEL_HEIGHT),
    width,
    height: OBJECT_LABEL_HEIGHT,
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
