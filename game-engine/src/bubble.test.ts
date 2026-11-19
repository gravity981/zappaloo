import { describe, expect, it } from "vitest";
import {
  BUBBLE_CLOSE_TILES,
  BUBBLE_MARGIN,
  BUBBLE_OPEN_TILES,
  bubbleHeight,
  bubbleWidth,
  chooseBubbles,
  isNear,
  NPC_BUBBLE_CLOSE_TILES,
  NPC_BUBBLE_OPEN_TILES,
  placeBubble,
} from "./bubble.ts";

const TILE = 64;

describe("when an NPC's bubble opens and closes (GAME-37)", () => {
  it("[GAME-37] opens within 3 tile widths and closes beyond 3.5, further than a guest's", () => {
    expect(NPC_BUBBLE_OPEN_TILES).toBe(3);
    expect(NPC_BUBBLE_CLOSE_TILES).toBe(3.5);
    expect(NPC_BUBBLE_OPEN_TILES).toBeGreaterThan(BUBBLE_OPEN_TILES);
    const near = (distance: number, wasOpen: boolean) =>
      isNear(distance, TILE, wasOpen, NPC_BUBBLE_OPEN_TILES, NPC_BUBBLE_CLOSE_TILES);
    expect(near(3 * TILE, false)).toBe(true);
    expect(near(3.2 * TILE, false)).toBe(false);
    expect(near(3.2 * TILE, true)).toBe(true);
    expect(near(3.6 * TILE, true)).toBe(false);
  });
});

describe("when a bubble opens and closes (PRES-10)", () => {
  it("[PRES-10] opens within 0.8 tile widths and closes beyond 1.1, so it does not flicker at the edge", () => {
    expect(BUBBLE_OPEN_TILES).toBe(0.8);
    expect(isNear(0.8 * TILE, TILE, false)).toBe(true);
    expect(isNear(0.8 * TILE + 1, TILE, false)).toBe(false);
    // Once open, it stays open a little further out.
    expect(isNear(1.0 * TILE, TILE, true)).toBe(true);
    expect(isNear(BUBBLE_CLOSE_TILES * TILE + 1, TILE, true)).toBe(false);
  });
});

describe("where a bubble stands (PRES-10)", () => {
  const view = { width: 800, height: 600 };
  const size = { width: 214, height: 90 };

  it("[PRES-10] is centred above the figure's head, its tail pointing at it", () => {
    const place = placeBubble({ x: 400, y: 300 }, size, view);
    expect(place.x).toBe(400 - 107);
    expect(place.y).toBeLessThan(300 - 90);
    expect(place.tail).toBe(107);
  });

  it("[PRES-10] stays inside the view at the sides, and the tail still points at the figure", () => {
    const left = placeBubble({ x: 10, y: 300 }, size, view);
    expect(left.x).toBe(BUBBLE_MARGIN);
    expect(left.tail).toBe(16);
    const right = placeBubble({ x: 795, y: 300 }, size, view);
    expect(right.x + size.width).toBe(view.width - BUBBLE_MARGIN);
    expect(right.tail).toBe(size.width - 16);
  });

  it("[PRES-10] does not go above the top of the view, or above a bar at its top", () => {
    expect(placeBubble({ x: 400, y: 20 }, size, view).y).toBe(BUBBLE_MARGIN);
    expect(placeBubble({ x: 400, y: 20 }, size, view, 56).y).toBe(56 + BUBBLE_MARGIN);
  });

  it("[PRES-10] is wider on a phone, and taller for more text", () => {
    expect(bubbleWidth(390)).toBeGreaterThan(bubbleWidth(1000));
    const short = bubbleHeight({ name: "Anna" }, 214);
    const long = bubbleHeight(
      { name: "Anna", badge: "Freunde Braut", greeting: "x".repeat(80), line: "y".repeat(60) },
      214,
    );
    expect(long).toBeGreaterThan(short);
  });
});

describe("which bubbles are shown (decision 10 of epic 6)", () => {
  const box = (x: number) => ({ x, y: 100, width: 214, height: 90 });

  it("[PRES-10] several bubbles are shown at once when they do not overlap", () => {
    const shown = chooseBubbles([
      { id: "a", distance: 50, box: box(0), pinned: false },
      { id: "b", distance: 80, box: box(300), pinned: false },
    ]);
    expect(shown.sort()).toEqual(["a", "b"]);
  });

  it("[PRES-10] of bubbles that would overlap only the nearest figure's is shown, whatever the input order", () => {
    const candidates = [
      { id: "far", distance: 90, box: box(100), pinned: false },
      { id: "near", distance: 40, box: box(0), pinned: false },
      { id: "farther", distance: 120, box: box(150), pinned: false },
    ];
    expect(chooseBubbles(candidates)).toEqual(["near"]);
    expect(chooseBubbles([...candidates].reverse())).toEqual(["near"]);
  });

  it("[PRES-10] a pinned bubble is always shown and wins against a nearer figure's", () => {
    const shown = chooseBubbles([
      { id: "near", distance: 10, box: box(0), pinned: false },
      { id: "pinned", distance: 300, box: box(100), pinned: true },
    ]);
    expect(shown).toEqual(["pinned"]);
  });
});
