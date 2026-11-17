import type { Point } from "./geometry.ts";

export const PLAYER_SPRITE_OFFSET = { x: -3, y: 10 } as const satisfies Point;

export function playerSpritePosition(feet: Point): Point {
  return {
    x: Math.round(feet.x + PLAYER_SPRITE_OFFSET.x),
    y: Math.round(feet.y + PLAYER_SPRITE_OFFSET.y),
  };
}

/**
 * Whether a point is on the avatar (GAME-18): a box of half the frame's width, standing on the sprite's bottom
 * centre and as high as the figure. The whole frame is wider and taller than the figure, so it would take taps that
 * belong to the world around it.
 */
export function onAvatar(
  point: Point,
  sprite: { x: number; y: number; displayWidth: number; displayHeight: number },
): boolean {
  const halfWidth = sprite.displayWidth / 4;
  const top = sprite.y - sprite.displayHeight;
  return Math.abs(point.x - sprite.x) <= halfWidth && point.y >= top && point.y <= sprite.y;
}
