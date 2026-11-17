// The grey "loading" overlay over the game while another map is built after a portal (GAME-30). The scene restarts
// for the new map, so the overlay belongs to the game, not to the scene: it is put up before the restart and taken
// down by the new scene when it is ready.
import type Phaser from "phaser";

const overlays = new WeakMap<Phaser.Game, { element: HTMLElement; timer: number }>();

/** An overlay that is still up after this long is taken down, so that a failed load cannot leave the game covered. */
const GIVE_UP_MS = 20_000;

/**
 * Puts the overlay up over the game's canvas: a grey, desaturated veil with the host's word for loading, if it has
 * one. It fades in, so that a map that is ready within a frame or two leaves no flicker.
 */
export function showLoadingOverlay(game: Phaser.Game, text: string | undefined): void {
  const parent = game.canvas.parentElement;
  if (parent === null || overlays.has(game)) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const element = document.createElement("div");
  element.setAttribute("data-testid", "map-loading");
  element.setAttribute("role", "status");
  element.style.cssText =
    "position:absolute;inset:0;z-index:6;display:grid;place-items:center;opacity:0;transition:opacity 150ms;" +
    "background:rgba(96,96,96,.7);-webkit-backdrop-filter:grayscale(1);backdrop-filter:grayscale(1);" +
    "color:#fff;font:600 14px system-ui,sans-serif";
  if (text !== undefined && text !== "") {
    const label = document.createElement("span");
    label.textContent = text;
    label.style.cssText = "padding:6px 14px;border-radius:999px;background:rgba(20,20,20,.75)";
    element.append(label);
  }
  parent.append(element);
  requestAnimationFrame(() => {
    element.style.opacity = "1";
  });
  overlays.set(game, {
    element,
    timer: window.setTimeout(() => {
      hideLoadingOverlay(game);
    }, GIVE_UP_MS),
  });
}

/** Takes the overlay down, if it is up. */
export function hideLoadingOverlay(game: Phaser.Game): void {
  const overlay = overlays.get(game);
  if (overlay === undefined) return;
  window.clearTimeout(overlay.timer);
  overlay.element.remove();
  overlays.delete(game);
}
