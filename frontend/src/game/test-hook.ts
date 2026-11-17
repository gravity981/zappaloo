// Test hook for the end-to-end tests (test-strategy.md, "Game world tests"): exposes the engine state to Playwright.
// Only built in when VITE_TEST_HOOKS=true.
import { WORLD_SCENE_KEY, type GameInstance, type GameState } from "@zappaloo/game-engine";

export interface GameTestHook {
  activeScenes: () => string[];
  state: () => GameState | undefined;
  renderArtwork: (mapId: string, width: number, height: number, zoom?: number) => Promise<void>;
}

declare global {
  interface Window {
    __zappaloo?: { game?: GameTestHook };
  }
}

let game: GameInstance | null = null;
let read: (() => GameState) | null = null;

function publish(): void {
  if (import.meta.env.VITE_TEST_HOOKS !== "true") return;
  const instance = game;
  window.__zappaloo = {
    game: instance
      ? {
          activeScenes: () => instance.scene.getScenes(true).map((scene) => scene.scene.key),
          state: () => read?.(),
          renderArtwork: async (mapId, width, height, zoom = 1) => {
            const parent = instance.canvas.parentElement;
            if (parent !== null) {
              parent.style.width = `${String(width)}px`;
              parent.style.height = `${String(height)}px`;
            }
            instance.scale.setParentSize(width, height).setGameSize(width, height);
            instance.scene.start(WORLD_SCENE_KEY, {
              mapId,
              spawn: "start",
              artworkOnly: true,
              zoom,
            });
            await new Promise<void>((resolve, reject) => {
              const timeout = window.setTimeout(() => {
                reject(
                  new Error(
                    `Phaser did not render ${width}x${height}; canvas is ${instance.canvas.width}x${instance.canvas.height}, scale is ${instance.scale.width}x${instance.scale.height}, parent is ${parent?.clientWidth}x${parent?.clientHeight}`,
                  ),
                );
              }, 10_000);
              const waitForRender = () => {
                if (
                  !instance.scene.isActive("world") ||
                  read?.().mapId !== mapId ||
                  instance.canvas.width !== width ||
                  instance.canvas.height !== height
                ) {
                  requestAnimationFrame(waitForRender);
                  return;
                }
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    window.clearTimeout(timeout);
                    resolve();
                  });
                });
              };
              requestAnimationFrame(waitForRender);
            });
          },
        }
      : undefined,
  };
}

/** Exposes the Phaser game (or removes it when `null`). */
export function exposeGame(instance: GameInstance | null): void {
  game = instance;
  publish();
}

/** Exposes the reader of the player's state (or removes it when `null`). */
export function exposeState(reader: (() => GameState) | null): void {
  read = reader;
  publish();
}
