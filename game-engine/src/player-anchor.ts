import type { Point } from "./geometry.ts";

export const PLAYER_SPRITE_OFFSET = { x: -3, y: 10 } as const satisfies Point;

export function playerSpritePosition(feet: Point): Point {
  return {
    x: Math.round(feet.x + PLAYER_SPRITE_OFFSET.x),
    y: Math.round(feet.y + PLAYER_SPRITE_OFFSET.y),
  };
}
