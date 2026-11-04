// Test hook for the end-to-end tests (test-strategy.md, "Game world tests"):
// exposes the game state to Playwright. Only built in when VITE_TEST_HOOKS=true.
import type Phaser from "phaser";

export interface GameTestHook {
  activeScenes: () => string[];
}

declare global {
  interface Window {
    __zappaloo?: { game?: GameTestHook };
  }
}

export function exposeGame(game: Phaser.Game | null): void {
  if (import.meta.env.VITE_TEST_HOOKS !== "true") return;
  window.__zappaloo = {
    game: game
      ? {
          activeScenes: () => game.scene.getScenes(true).map((scene) => scene.scene.key),
        }
      : undefined,
  };
}
