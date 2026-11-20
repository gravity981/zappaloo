// The white screen between two maps (GAME-30). A portal fades the game out to white with the camera; the scene then
// restarts for the new map, and a restart throws the camera's fade away. This layer keeps the screen white from the
// end of the fade until the new map is ready, and the new scene takes it down as its own flash begins from white. It
// belongs to the game, not to the scene, like the loading overlay.
import type Phaser from "phaser";

const layers = new WeakMap<Phaser.Game, HTMLElement>();

/** Covers the game's canvas with white at once, if it is not covered already. */
export function showWhiteout(game: Phaser.Game): void {
  const parent = game.canvas.parentElement;
  if (parent === null || layers.has(game)) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const element = document.createElement("div");
  element.setAttribute("data-testid", "map-whiteout");
  element.style.cssText = "position:absolute;inset:0;z-index:6;background:#fff;pointer-events:none";
  parent.append(element);
  layers.set(game, element);
}

/**
 * Takes the white layer down, if it is up, after `frames` frames of the browser. The new scene starts its flash from
 * white at the same moment, so that a frame of the bare map never shows between the two.
 */
export function hideWhiteout(game: Phaser.Game, frames = 2): void {
  const element = layers.get(game);
  if (element === undefined) return;
  layers.delete(game);
  const remove = (left: number) => {
    if (left <= 0) element.remove();
    else
      requestAnimationFrame(() => {
        remove(left - 1);
      });
  };
  remove(frames);
}
