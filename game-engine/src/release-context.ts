// Giving the graphics memory back when the game ends (PWA-07). Phaser's renderer deletes its own GL objects when the
// game is destroyed, but never releases the WebGL context itself; the browser keeps the context and the canvas's
// drawing buffer until garbage collection, which Safari on iOS does late. Phones are limited in the number of
// contexts, and a leaked one slows the whole device down.

/** The part of a WebGL context that releasing it uses. */
export interface ReleasableContext {
  getExtension(name: "WEBGL_lose_context"): { loseContext(): void } | null;
}

/** The part of a canvas that releasing it uses. */
export interface ReleasableCanvas {
  width: number;
  height: number;
}

/**
 * Releases the context and shrinks the canvas's drawing buffer to one pixel, so the memory is free at once and not
 * when the browser collects the canvas. Safe to call on a context that is lost already.
 */
export function releaseContext(gl: ReleasableContext, canvas: ReleasableCanvas): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
  canvas.width = 1;
  canvas.height = 1;
}
