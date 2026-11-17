import { describe, expect, it } from "vitest";
import type { WorldObjectAction } from "@zappaloo/shared";
import {
  actionOf,
  arrivedAt,
  clickableAt,
  clickableInReach,
  MAX_SPARKLES,
  nextShineDelay,
  nextSparkleDelay,
  shineGradient,
  TAP_TOLERANCE,
  visibleEdge,
} from "./interaction.ts";
import type { ClickableArea, ParsedMap } from "./map-model.ts";

const square = (x: number, y: number, side: number) => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

const altar: ClickableArea = {
  name: "altar",
  hidden: false,
  polygon: square(0, 0, 40),
  approach: { x: 20, y: 70 },
  preset: { kind: "page", page: "programme" },
};
const egg: ClickableArea = {
  name: "osterei",
  hidden: true,
  polygon: square(400, 0, 16),
  approach: { x: 408, y: 40 },
};
const map = {
  id: "kirche",
  size: { width: 64, height: 32 },
  clickables: [altar, egg],
} as ParsedMap;

describe("clickable objects in play (GAME-16, GAME-06, GAME-15, MAP-15)", () => {
  it("[GAME-16] a tap on an object, or just beside it, means that object; a tap further away means none", () => {
    expect(clickableAt(map, { x: 20, y: 20 })?.name).toBe("altar");
    expect(clickableAt(map, { x: 40 + TAP_TOLERANCE - 1, y: 20 })?.name).toBe("altar");
    expect(clickableAt(map, { x: 40 + TAP_TOLERANCE + 5, y: 20 })).toBeUndefined();
    expect(clickableAt(map, { x: 408, y: 8 })?.name).toBe("osterei");
  });

  it("[GAME-16] Enter or Space activates the nearest object within a tile width of the avatar", () => {
    expect(clickableInReach(map, { x: 20, y: 70 })?.name).toBe("altar");
    expect(clickableInReach(map, { x: 20, y: 90 })?.name).toBe("altar");
    expect(clickableInReach(map, { x: 20, y: 200 })).toBeUndefined();
  });

  it("[GAME-16] the action runs when the walk has ended at the approach point, or beside the object where the way was blocked", () => {
    expect(arrivedAt(map, altar, { x: 25, y: 72 })).toBe(true);
    expect(arrivedAt(map, altar, { x: 70, y: 20 })).toBe(true);
    expect(arrivedAt(map, altar, { x: 200, y: 200 })).toBe(false);
  });

  it("[MAP-15][GAME-06] an assignment of the admin replaces the preset; without either, nothing happens", () => {
    const none: WorldObjectAction = { kind: "none" };
    const assigned = new Map<string, WorldObjectAction>([
      ["kirche/altar", { kind: "page", page: "profile" }],
    ]);
    expect(actionOf(assigned, "kirche", altar)).toEqual({ kind: "page", page: "profile" });
    expect(actionOf(new Map(), "kirche", altar)).toEqual({ kind: "page", page: "programme" });
    expect(actionOf(new Map(), "kirche", egg)).toEqual(none);
  });

  it("[GAME-15] small sparkles come every 0.15 to 0.45 seconds, at most five at a time, and a shine every 3 to 7 seconds", () => {
    expect(MAX_SPARKLES).toBe(5);
    expect(nextSparkleDelay(() => 0)).toBe(150);
    expect(nextSparkleDelay(() => 0.5)).toBe(300);
    expect(nextSparkleDelay(() => 0.999)).toBeLessThan(450);
    expect(nextShineDelay(() => 0)).toBe(3000);
    expect(nextShineDelay(() => 0.5)).toBe(5000);
    expect(nextShineDelay(() => 0.999)).toBeLessThan(7000);
  });

  it("[GAME-15] the shine is a slanted band that sweeps across the whole picture from left to right", () => {
    const width = 64;
    const height = 48;
    // The position of a corner along the gradient's axis: how far it is from the band's start.
    const along = (line: ReturnType<typeof shineGradient>, x: number, y: number) => {
      const dx = line.x1 - line.x0;
      const dy = line.y1 - line.y0;
      return ((x - line.x0) * dx + (y - line.y0) * dy) / (dx * dx + dy * dy);
    };
    const corners = [
      [0, 0],
      [width, 0],
      [0, height],
      [width, height],
    ] as const;
    // At the start, every corner is behind the band's end: it has not reached the picture.
    const start = shineGradient(width, height, 0);
    expect(corners.every(([x, y]) => along(start, x, y) >= 1 - 1e-9)).toBe(true);
    // At the end, the band has passed every corner.
    const end = shineGradient(width, height, 1);
    expect(corners.every(([x, y]) => along(end, x, y) <= 1e-9)).toBe(true);
    // In between, the band lies across the picture, and it is slanted, not vertical.
    const middle = shineGradient(width, height, 0.5);
    const inside = corners.map(([x, y]) => along(middle, x, y));
    expect(Math.min(...inside)).toBeLessThan(0.5);
    expect(Math.max(...inside)).toBeGreaterThan(0.5);
    expect(middle.y1).not.toBe(middle.y0);
    // It moves to the right.
    expect(shineGradient(width, height, 0.7).x0).toBeGreaterThan(middle.x0);
  });

  it("[GAME-15] sparkles sit on the visible edge of a picture, never on transparent pixels", () => {
    // A 20 × 20 picture whose opaque part is a 10 × 10 square at (4, 4); the rest is transparent.
    const alphaAt = (x: number, y: number) => (x >= 4 && x < 14 && y >= 4 && y < 14 ? 255 : 0);
    const edge = visibleEdge(alphaAt, 20, 20, 2);
    expect(edge.length).toBeGreaterThan(0);
    // Every point is an opaque pixel, and the inside of the square is not an edge.
    expect(edge.every((point) => alphaAt(point.x, point.y) === 255)).toBe(true);
    expect(edge).not.toContainEqual({ x: 8, y: 8 });
    expect(edge).toContainEqual({ x: 4, y: 4 });
    // A fully transparent picture has no edge at all.
    expect(visibleEdge(() => 0, 20, 20)).toEqual([]);
  });
});
