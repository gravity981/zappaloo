import { describe, expect, it } from "vitest";
import { directionOf, keyDirection, stepPosition } from "./movement.ts";

describe("movement (GAME-02, GAME-09)", () => {
  it("[GAME-09] one arrow key moves in its screen direction, two keys move diagonally at the same speed", () => {
    expect(keyDirection({ left: false, right: true, up: false, down: false })).toEqual({
      x: 1,
      y: 0,
    });
    const diagonal = keyDirection({ left: false, right: true, up: false, down: true });
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(keyDirection({ left: true, right: true, up: false, down: false })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("[GAME-02] a figure slides along an obstacle instead of stopping at it", () => {
    // Walls at x > 10: a diagonal step into the wall keeps the y-move.
    const walkable = (p: { x: number; y: number }) => p.x <= 10;
    const after = stepPosition({ x: 9, y: 0 }, { x: 3, y: 3 }, walkable);
    expect(after).toEqual({ x: 9, y: 3 });
  });

  it("[GAME-02] a figure does not move into a blocked point", () => {
    const after = stepPosition({ x: 0, y: 0 }, { x: 5, y: 0 }, () => false);
    expect(after).toEqual({ x: 0, y: 0 });
  });

  it("[GAME-02] the figure faces the nearest of its four directions on screen", () => {
    expect(directionOf({ x: 0, y: 1 })).toBe("south");
    expect(directionOf({ x: 1, y: 0 })).toBe("east");
    expect(directionOf({ x: 0, y: -1 })).toBe("north");
    expect(directionOf({ x: -1, y: 0 })).toBe("west");
    expect(directionOf({ x: 0.9, y: 0.5 })).toBe("east");
  });
});
