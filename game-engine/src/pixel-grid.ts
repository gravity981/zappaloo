// The pixel grid of the game view (GAME-27): the canvas is drawn at device pixels, and everything that moves with the
// camera (the camera's centre and the player's sprite) is snapped to the same grid, so the world advances in small,
// even steps while the avatar walks.

/** The most device pixels per CSS pixel the canvas is drawn at; more costs fill rate without a visible gain. */
export const MAX_PIXEL_RATIO = 3;

/** The canvas's pixel ratio for a device pixel ratio: at least 1 and at most {@link MAX_PIXEL_RATIO}. */
export function canvasPixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio < 1) return 1;
  return Math.min(devicePixelRatio, MAX_PIXEL_RATIO);
}

/** The size of the canvas buffer in device pixels for a size in CSS pixels. */
export function canvasBufferSize(
  css: { width: number; height: number },
  ratio: number,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(css.width * ratio)),
    height: Math.max(1, Math.round(css.height * ratio)),
  };
}

/**
 * Snaps a world coordinate to the device-pixel grid: one device pixel is 1 / (zoom × ratio) world pixels. The camera
 * and the sprite both use this, so the avatar keeps its exact place on the screen and the world moves in steps of
 * one device pixel at a time, whatever the size of the canvas (an odd size puts the camera's centre on a half pixel).
 */
export function snapToPixelGrid(value: number, zoom: number, ratio: number): number {
  const scale = zoom * ratio;
  return Math.round(value * scale) / scale;
}
