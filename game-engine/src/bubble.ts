// The speech bubbles (PRES-10, GAME-37; sw-architecture.md 3.6): when a bubble opens and closes, where it is placed in
// the view, how big a greeting bubble is, and which bubble is shown: only one at a time. The layout is computed here
// without a browser, like the edge indicators (indicators.ts); bubble-layer.ts only puts the HTML in place.
import type { Point } from "./geometry.ts";
import { objectLabelHeight } from "./object-labels.ts";

/** A guest figure's bubble opens when the player is this close, in tile widths (decided 2026-11-18). */
export const BUBBLE_OPEN_TILES = 0.8;
/** An open bubble closes when the player is further away than this, so that it does not flicker at the edge. */
export const BUBBLE_CLOSE_TILES = 1.1;
/**
 * The greeting of an object or NPC wants attention: its bubble opens from further away, within 4 tile widths, and
 * closes beyond 4.5 (GAME-37, decided 2026-11-19, epic 6.1; it was 3 for NPCs).
 */
export const GREETING_BUBBLE_OPEN_TILES = 4;
export const GREETING_BUBBLE_CLOSE_TILES = 4.5;

/** The width of a bubble in CSS pixels (the mock's): wider on a phone. */
export const BUBBLE_WIDTH = 214;
export const BUBBLE_WIDTH_PHONE = 240;
const PHONE_VIEW = 520;
/** The gap between a bubble's tail and the figure, and the least space to the edges of the view. */
export const BUBBLE_GAP = 8;
export const BUBBLE_MARGIN = 8;

export const bubbleWidth = (viewWidth: number): number =>
  viewWidth < PHONE_VIEW ? BUBBLE_WIDTH_PHONE : BUBBLE_WIDTH;

/** Whether a guest at `distance` (map pixels) has an open bubble: it opens within 0.8 tile widths and stays until 1.1. */
export function isNear(
  distance: number,
  tileWidth: number,
  wasOpen: boolean,
  openTiles = BUBBLE_OPEN_TILES,
  closeTiles = BUBBLE_CLOSE_TILES,
): boolean {
  return distance <= (wasOpen ? closeTiles : openTiles) * tileWidth;
}

/**
 * What a bubble shows; the height is estimated from the text, because the layout runs without a browser. A `compact`
 * bubble (the greeting of an object or NPC) shows the greeting only: no picture, no name, no badge, and it is as small
 * as the text allows; `name` is then what a screen reader calls it.
 */
export interface BubbleContent {
  name: string;
  badge?: string | undefined;
  greeting?: string | undefined;
  line?: string | undefined;
  compact?: boolean | undefined;
}

/** The width of one character of a greeting (12 px), estimated, the padding and border of a compact bubble, one line. */
const GREETING_CHAR_WIDTH = 6.4;
const GREETING_PAD_X = 24;
const GREETING_PAD_Y = 16;
const GREETING_LINE = 16;

/**
 * The size of a compact bubble: as wide as its greeting needs up to the width of a bubble, and as high as the rows of
 * text need. The text is all there is in it, so it is as small as possible.
 */
export function greetingBubbleSize(
  greeting: string,
  viewWidth: number,
): { width: number; height: number } {
  const wanted = Array.from(greeting).length * GREETING_CHAR_WIDTH;
  const width = Math.min(bubbleWidth(viewWidth), Math.ceil(wanted) + GREETING_PAD_X);
  const rows = Math.max(1, Math.ceil(wanted / Math.max(1, width - GREETING_PAD_X)));
  return { width, height: rows * GREETING_LINE + GREETING_PAD_Y };
}

/** The room a label takes above a figure that a bubble has to stay clear of: its height and the gap to the figure. */
export function labelClearance(labelText: string | undefined, viewWidth: number): number {
  if (labelText === undefined) return 0;
  return objectLabelHeight(labelText, Math.min(viewWidth, 260)) + 6;
}

/** The estimated height of a bubble in CSS pixels, from its lines of text (at least the picture's height). */
export function bubbleHeight(content: BubbleContent, width: number): number {
  const chars = Math.max(10, Math.floor((width - 20 - 40 - 10) / 6.2));
  const rows = (text: string | undefined) =>
    text === undefined || text === "" ? 0 : Math.ceil(text.length / chars);
  const lines =
    1 + (content.badge === undefined ? 0 : 1) + rows(content.greeting) + rows(content.line);
  return Math.max(40, lines * 17) + 24;
}

export interface BubblePlace {
  /** The top left corner in the game view, in CSS pixels. */
  x: number;
  y: number;
  /** Where the tail points to, from the left edge of the bubble, so that it still points at the figure at the edges. */
  tail: number;
}

/**
 * Where a bubble stands: centred above `anchor` (the top of the figure's head in the view), moved sideways to stay
 * inside the view, and not above its top edge (`top`, e.g. below the game bar).
 */
export function placeBubble(
  anchor: Point,
  size: { width: number; height: number },
  view: { width: number; height: number },
  top = 0,
): BubblePlace {
  const left = BUBBLE_MARGIN;
  const right = Math.max(left, view.width - BUBBLE_MARGIN - size.width);
  const x = Math.min(right, Math.max(left, anchor.x - size.width / 2));
  const y = Math.max(top + BUBBLE_MARGIN, anchor.y - BUBBLE_GAP - size.height);
  const tail = Math.min(size.width - 16, Math.max(16, anchor.x - x));
  return { x, y, tail };
}

export interface BubbleCandidate {
  id: string;
  /** The distance of the figure from the player in map pixels. */
  distance: number;
  /** A bubble the player has pinned stays until its cross is used. */
  pinned: boolean;
}

/**
 * The bubble to show (GAME-37, decision 4 of epic 6.1): exactly one at a time. A bubble the player pinned stays, and no
 * other opens meanwhile; otherwise the nearest figure's, of all those whose range the player is in. The input order does
 * not matter. No candidate: none.
 */
export function chooseBubbles(candidates: readonly BubbleCandidate[]): string[] {
  const [first] = [...candidates].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.distance - b.distance,
  );
  return first === undefined ? [] : [first.id];
}
