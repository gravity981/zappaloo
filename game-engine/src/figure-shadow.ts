// The shadow of the player's figure (GAME-28): a soft ellipse on the ground under the feet, like the shadow of a
// portal's floating arrow.
import type { Point } from "./geometry.ts";
import { snapToPixelGrid } from "./pixel-grid.ts";

/** The shadow's width in tile widths; its height is half of it, the 2 : 1 ratio of the ground. */
export const SHADOW_WIDTH_TILES = 0.32;
export const SHADOW_OPACITY = 0.3;

/** How far below the figure's depth the shadow is drawn, so that objects in front of the figure cover both. */
export const SHADOW_DEPTH_BELOW = 0.001;

export interface FigureShadow {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
}

/** The shadow for a figure standing at `feet`, on the device-pixel grid of the camera like the sprite (GAME-27). */
export function figureShadow(
  feet: Point,
  tileWidth: number,
  zoom: number,
  ratio: number,
): FigureShadow {
  const width = tileWidth * SHADOW_WIDTH_TILES;
  return {
    x: snapToPixelGrid(feet.x, zoom, ratio),
    y: snapToPixelGrid(feet.y, zoom, ratio),
    width,
    height: width / 2,
    opacity: SHADOW_OPACITY,
  };
}
