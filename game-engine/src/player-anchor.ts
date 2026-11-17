import type { Point } from "./geometry.ts";
import { snapToPixelGrid } from "./pixel-grid.ts";

export const PLAYER_SPRITE_OFFSET = { x: -3, y: 10 } as const satisfies Point;

/**
 * Where the sprite is drawn for the logical feet: at the fixed offset, snapped to the device-pixel grid. A fractional
 * position would be rounded differently from frame to frame and make things shimmer. The grid is the one of the
 * camera (`zoom` and `ratio`, see pixel-grid.ts), so the sprite and the view move together (GAME-27).
 */
export function playerSpritePosition(feet: Point, zoom = 1, ratio = 1): Point {
  return {
    x: snapToPixelGrid(feet.x + PLAYER_SPRITE_OFFSET.x, zoom, ratio),
    y: snapToPixelGrid(feet.y + PLAYER_SPRITE_OFFSET.y, zoom, ratio),
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
