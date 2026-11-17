// The development diagnostics overlay (GAME-27): device pixel ratio, canvas buffer and CSS size, raw frame times and
// the camera's step per frame. Only the game preview and the dev server (`?debug=frames`) switch it on, so it does
// not reach a production build (MAP-18).

import { FrameStats } from "./frame-stats.ts";

export interface DiagnosticsSource {
  pixelRatio: () => number;
  /** The camera: its centre in world pixels, its zoom in device pixels per world pixel, the canvas buffer's size. */
  camera: () => { x: number; y: number; zoom: number; width: number; height: number } | undefined;
}

/** Frames per second for a frame time in milliseconds. */
function fps(milliseconds: number): string {
  return milliseconds > 0 ? (1000 / milliseconds).toFixed(0) : "–";
}

/** Shows the overlay in `parent` and returns the function that removes it. */
export function showDiagnostics(parent: HTMLElement, source: DiagnosticsSource): () => void {
  const element = document.createElement("pre");
  element.setAttribute("data-testid", "game-diagnostics");
  element.style.cssText =
    "position:absolute;left:4px;bottom:4px;z-index:5;margin:0;padding:4px 6px;font:11px/1.3 monospace;" +
    "color:#fff;background:rgba(0,0,0,.65);pointer-events:none;white-space:pre";
  parent.append(element);
  const stats = new FrameStats();
  let handle = 0;
  let lastShown = 0;
  const tick = (time: number): void => {
    const camera = source.camera();
    if (camera !== undefined) stats.add(time, camera.x, camera.y);
    if (camera !== undefined && time - lastShown >= 250) {
      lastShown = time;
      const ratio = source.pixelRatio();
      const summary = stats.summary(camera.zoom);
      element.textContent = [
        `dpr ${window.devicePixelRatio} · ratio ${ratio}`,
        `canvas ${camera.width}×${camera.height} px · css ${Math.round(camera.width / ratio)}×${Math.round(camera.height / ratio)}`,
        `fps min ${fps(summary.maxMs)} · avg ${fps(summary.averageMs)} · max ${fps(summary.minMs)}`,
        `camera step px min ${summary.minStepPx.toFixed(1)} · max ${summary.maxStepPx.toFixed(1)}`,
      ].join("\n");
    }
    handle = requestAnimationFrame(tick);
  };
  handle = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(handle);
    element.remove();
  };
}
