// Test hook for the end-to-end tests (test-strategy.md, "Game world tests"): exposes the game state to Playwright:
// the active scenes, and the map, the position and the direction of the player. Only built in when
// VITE_TEST_HOOKS=true.
import type Phaser from "phaser";

export interface GameState {
  mapId: string;
  /** The player's position in the map's pixel space. */
  x: number;
  y: number;
  direction: string;
  /** The camera: the map point at its centre, its zoom, and its size in game pixels (the canvas). */
  view: { x: number; y: number; zoom: number; width: number; height: number };
}

export interface GameTestHook {
  activeScenes: () => string[];
  state: () => GameState | undefined;
}

declare global {
  interface Window {
    __zappaloo?: { game?: GameTestHook };
  }
}

let game: Phaser.Game | null = null;
let read: (() => GameState) | null = null;

function publish(): void {
  if (import.meta.env.VITE_TEST_HOOKS !== "true") return;
  window.__zappaloo = {
    game: game
      ? {
          activeScenes: () => game?.scene.getScenes(true).map((scene) => scene.scene.key) ?? [],
          state: () => read?.(),
        }
      : undefined,
  };
}

/** Exposes the Phaser game (or removes it when `null`). */
export function exposeGame(instance: Phaser.Game | null): void {
  game = instance;
  publish();
}

/** Exposes the reader of the player's state (or removes it when `null`). */
export function exposeState(reader: (() => GameState) | null): void {
  read = reader;
  publish();
}
