// The pause the page asks for (GAME-11) is kept in the game registry, so it is not lost when the page asks
// before the scene exists or is still loading. The scene applies it when it starts running.
import { PAUSED_REGISTRY_KEY } from "./host.ts";

/** The part of Phaser's data manager that the pause state uses (the game registry and the scene registry). */
export interface PauseStore {
  get(key: string): unknown;
  set(key: string, value: unknown): unknown;
}

/** Remembers whether the game should stand still. */
export function rememberPause(store: PauseStore, paused: boolean): void {
  store.set(PAUSED_REGISTRY_KEY, paused);
}

/** Whether the game has been asked to stand still; nothing asked means it runs. */
export function startsPaused(store: PauseStore): boolean {
  return store.get(PAUSED_REGISTRY_KEY) === true;
}

/** The part of Phaser's game loop that stopping the drawing uses. */
export interface DrawLoop {
  running: boolean;
  sleep(): void;
  resetDelta(): void;
  wake(): void;
}

/**
 * Stops the game loop while the game stands still behind a page (GAME-44), and starts it again afterwards. A paused
 * Phaser scene is still drawn every frame, so the full-resolution canvas with its filters would compete with the
 * page opening above it; with the loop asleep the canvas keeps its last picture and costs nothing. A loop that a test
 * plays by hand (`manual`) is never woken.
 */
export function setLoopAsleep(loop: DrawLoop, paused: boolean, manual: boolean): void {
  if (manual) return;
  if (paused) {
    loop.sleep();
  } else if (!loop.running) {
    loop.resetDelta();
    loop.wake();
  }
}
