import { describe, expect, it } from "vitest";
import {
  BUBBLE_CLOSE_TILES,
  BUBBLE_MARGIN,
  BUBBLE_OPEN_TILES,
  bubbleHeight,
  bubbleWidth,
  chooseBubbles,
  GREETING_BUBBLE_CLOSE_TILES,
  GREETING_BUBBLE_OPEN_TILES,
  greetingBubbleSize,
  isNear,
  placeBubble,
} from "./bubble.ts";

const TILE = 64;

describe("when a greeting bubble opens and closes (GAME-37)", () => {
  it("[GAME-37] opens within 2 tile widths and closes beyond 2.25, further than a guest's", () => {
    // Half of the first range of 4 tiles (4 : 4.5 before), with the same ratio of opening and closing.
    expect(GREETING_BUBBLE_OPEN_TILES).toBe(2);
    expect(GREETING_BUBBLE_CLOSE_TILES).toBe(2.25);
    expect(GREETING_BUBBLE_OPEN_TILES).toBeGreaterThan(BUBBLE_OPEN_TILES);
    const near = (distance: number, wasOpen: boolean) =>
      isNear(distance, TILE, wasOpen, GREETING_BUBBLE_OPEN_TILES, GREETING_BUBBLE_CLOSE_TILES);
    expect(near(2 * TILE, false)).toBe(true);
    expect(near(2.1 * TILE, false)).toBe(false);
    expect(near(2.2 * TILE, true)).toBe(true);
    expect(near(2.3 * TILE, true)).toBe(false);
  });
});

describe("how big a greeting bubble is (GAME-37)", () => {
  it("[GAME-37] is as small as its text allows: narrower for a short greeting, one row", () => {
    const short = greetingBubbleSize("Hallo!", 1000);
    const longer = greetingBubbleSize("Schön, dass du da bist!", 1000);
    expect(short.width).toBeLessThan(longer.width);
    expect(short.width).toBeLessThan(bubbleWidth(1000) / 2);
    expect(short.height).toBe(longer.height);
    // Nothing but the text: a row, and the padding.
    expect(short.height).toBeLessThan(40);
  });

  it("[GAME-37] is never wider than a bubble of a guest, and a longer text takes more rows", () => {
    const long = greetingBubbleSize("x".repeat(200), 1000);
    expect(long.width).toBe(bubbleWidth(1000));
    expect(long.height).toBeGreaterThan(greetingBubbleSize("x".repeat(10), 1000).height);
    expect(greetingBubbleSize("x".repeat(200), 390).width).toBe(bubbleWidth(390));
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

describe("which bubble is shown (GAME-37, decision 4 of epic 6.1)", () => {
  it("[GAME-37] exactly one bubble is shown: of the figures whose range the player is in, the nearest, whatever the input order", () => {
    const candidates = [
      { id: "far", distance: 90, pinned: false },
      { id: "near", distance: 40, pinned: false },
      { id: "farther", distance: 120, pinned: false },
    ];
    expect(chooseBubbles(candidates)).toEqual(["near"]);
    expect(chooseBubbles([...candidates].reverse())).toEqual(["near"]);
  });

  it("[GAME-37] none is shown when no figure is in range", () => {
    expect(chooseBubbles([])).toEqual([]);
  });

  it("[PRES-10] a pinned bubble stays and wins against a nearer figure's: no other bubble opens meanwhile", () => {
    const shown = chooseBubbles([
      { id: "near", distance: 10, pinned: false },
      { id: "pinned", distance: 300, pinned: true },
      { id: "also-near", distance: 20, pinned: false },
    ]);
    expect(shown).toEqual(["pinned"]);
  });
});
