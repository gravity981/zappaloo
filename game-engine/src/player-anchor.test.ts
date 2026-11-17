import { describe, expect, it } from "vitest";
import { onAvatar, playerSpritePosition } from "./player-anchor.ts";

describe("the player's sprite anchor (GAME-02)", () => {
  it("[GAME-02] renders the sprite at a fixed offset from the logical feet", () => {
    expect(playerSpritePosition({ x: 100, y: 200 })).toEqual({ x: 97, y: 210 });
  });
});

describe("the tap on the own avatar (GAME-18)", () => {
  // A 64 × 64 frame; the figure stands on the feet at (100, 200) and reaches up to y = 136.
  const sprite = { x: 100, y: 200, displayWidth: 64, displayHeight: 64 };

  it("[GAME-18] a tap on the figure is on the avatar; a tap on the empty frame beside it is not", () => {
    expect(onAvatar({ x: 100, y: 180 }, sprite)).toBe(true);
    expect(onAvatar({ x: 110, y: 190 }, sprite)).toBe(true);
    // Within the frame, but beside the figure (half the frame's width is the figure's).
    expect(onAvatar({ x: 130, y: 190 }, sprite)).toBe(false);
    // Above the figure, or below its feet.
    expect(onAvatar({ x: 100, y: 130 }, sprite)).toBe(false);
    expect(onAvatar({ x: 100, y: 210 }, sprite)).toBe(false);
  });
});
