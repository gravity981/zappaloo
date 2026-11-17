import { describe, expect, it } from "vitest";
import { playerSpritePosition } from "./player-anchor.ts";

describe("the player's sprite anchor (GAME-02)", () => {
  it("[GAME-02] renders the sprite at a fixed offset from the logical feet", () => {
    expect(playerSpritePosition({ x: 100, y: 200 })).toEqual({ x: 97, y: 210 });
  });
});
