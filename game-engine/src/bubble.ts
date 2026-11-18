// The speech bubbles of the guest figures (PRES-10; sw-architecture.md 3.6): when a bubble opens and closes, where it
// is placed in the view, and which of several bubbles are shown. The layout is computed here without a browser, like
// the edge indicators (indicators.ts); bubble-layer.ts only puts the HTML in place.
import type { Point } from "./geometry.ts";
import { boxesOverlap, type Rect } from "./indicators.ts";

/** A guest figure's bubble opens when the player is this close, in tile widths (decided 2026-11-18; NPCs: 3). */
export const BUBBLE_OPEN_TILES = 0.8;
/** An open bubble closes when the player is further away than this, so that it does not flicker at the edge. */
export const BUBBLE_CLOSE_TILES = 1.1;

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
export function isNear(distance: number, tileWidth: number, wasOpen: boolean): boolean {
  return distance <= (wasOpen ? BUBBLE_CLOSE_TILES : BUBBLE_OPEN_TILES) * tileWidth;
}

/** What a bubble shows; the height is estimated from the text, because the layout runs without a browser. */
export interface BubbleContent {
  name: string;
  badge?: string | undefined;
  greeting?: string | undefined;
  line?: string | undefined;
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
  box: Rect;
  /** A bubble the player has pinned is always shown. */
  pinned: boolean;
}

/**
 * The bubbles to show (decision 10 of epic 6): the pinned ones, then the nearest figures' in turn, and of bubbles that
 * would overlap only the nearer one, as with the edge indicators. The input order does not matter.
 */
export function chooseBubbles(candidates: readonly BubbleCandidate[]): string[] {
  const ordered = [...candidates].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || a.distance - b.distance,
  );
  const shown: BubbleCandidate[] = [];
  for (const candidate of ordered) {
    if (!candidate.pinned && shown.some((other) => boxesOverlap(other.box, candidate.box)))
      continue;
    shown.push(candidate);
  }
  return shown.map((candidate) => candidate.id);
}
