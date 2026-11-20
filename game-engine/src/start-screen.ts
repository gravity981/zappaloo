// The black screen with a progress bar over the game while it starts (GAME-43): the world package's files load, then the
// first map is built. It belongs to the game, not to the scene (the scene restarts after a portal, the screen does not
// come back: a portal has its own veil, GAME-30). The words are the host's; without any, the bar stands alone.
import type Phaser from "phaser";

/** The share of the bar the loader fills; the rest is the build of the map. */
export const LOADER_SHARE = 0.7;
/** The bar's value once the map is drawn and the figures, the guests and the atmosphere are still to be set up. */
export const MAP_DRAWN = 0.9;

/** The bar's values at which the text changes: the start, then every step of the loading and the build. */
const STEP_STARTS = [0, 0.25, 0.5, LOADER_SHARE, MAP_DRAWN] as const;

/** The number of the step a value of the bar belongs to. */
export function stepOf(fraction: number): number {
  let step = 0;
  for (const [index, start] of STEP_STARTS.entries()) if (fraction >= start) step = index;
  return step;
}

/** The text of the next step: at random from the pool, and not the one before, if the pool has another. */
export function pickStepText(
  pool: readonly string[],
  previous: string | undefined,
  random: () => number,
): string | undefined {
  const candidates = pool.length > 1 ? pool.filter((text) => text !== previous) : pool;
  return candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))];
}

interface StartScreen {
  element: HTMLElement;
  bar: HTMLElement;
  text: HTMLElement;
  step: number;
  shown: string | undefined;
  pool: readonly string[];
  random: () => number;
}

const screens = new WeakMap<Phaser.Game, StartScreen>();

/** Puts the black screen with an empty bar over the game's parent. */
export function showStartScreen(
  game: Phaser.Game,
  parent: HTMLElement,
  pool: readonly string[],
  random: () => number,
): void {
  if (screens.has(game)) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  const element = document.createElement("div");
  element.setAttribute("data-testid", "game-start");
  element.setAttribute("role", "status");
  element.style.cssText =
    "position:absolute;inset:0;z-index:7;display:flex;flex-direction:column;align-items:center;" +
    "justify-content:center;gap:14px;background:#000;color:#fff;font:600 14px system-ui,sans-serif;" +
    "text-align:center;padding:0 24px";
  const track = document.createElement("div");
  track.style.cssText =
    "width:min(280px,70%);height:8px;border-radius:999px;background:rgba(255,255,255,.2);overflow:hidden";
  const bar = document.createElement("div");
  bar.setAttribute("data-testid", "game-start-bar");
  bar.style.cssText = "width:0;height:100%;border-radius:999px;background:#fff";
  track.append(bar);
  const text = document.createElement("div");
  text.setAttribute("data-testid", "game-start-text");
  text.style.minHeight = "1.4em";
  element.append(track, text);
  parent.append(element);
  const screen: StartScreen = { element, bar, text, step: -1, shown: undefined, pool, random };
  screens.set(game, screen);
  setStartProgress(game, 0);
}

/** Moves the bar to a value between 0 and 1 (it never goes back) and changes the text when a new step begins. */
export function setStartProgress(game: Phaser.Game, fraction: number): void {
  const screen = screens.get(game);
  if (screen === undefined) return;
  const value = Math.min(1, Math.max(0, fraction));
  const width = Number.parseFloat(screen.bar.style.width) / 100;
  if (Number.isNaN(width) || value > width) screen.bar.style.width = `${String(value * 100)}%`;
  const step = stepOf(value);
  if (step > screen.step) {
    screen.step = step;
    screen.shown = pickStepText(screen.pool, screen.shown, screen.random);
    screen.text.textContent = screen.shown ?? "";
  }
}

/** Takes the screen down, if it is up. */
export function hideStartScreen(game: Phaser.Game): void {
  const screen = screens.get(game);
  if (screen === undefined) return;
  screen.element.remove();
  screens.delete(game);
}

/** Whether the screen is up, so that the loader only reports to a screen that exists. */
export function startScreenIsUp(game: Phaser.Game): boolean {
  return screens.has(game);
}
