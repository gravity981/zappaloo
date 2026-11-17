import { describe, expect, it } from "vitest";
import { PAUSED_REGISTRY_KEY } from "./host.ts";
import { rememberPause, startsPaused, type PauseStore } from "./pause.ts";

/** A registry like Phaser's data manager, kept in a map. */
function registry(): PauseStore & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>();
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => values.set(key, value),
  };
}

describe("the pause the page asks for (GAME-11)", () => {
  it("[GAME-11] a game that nobody paused starts running", () => {
    expect(startsPaused(registry())).toBe(false);
  });

  it("[GAME-11] a pause asked before the scene exists is kept in the registry until the scene starts", () => {
    const game = registry();
    rememberPause(game, true);
    expect(game.values.get(PAUSED_REGISTRY_KEY)).toBe(true);
    expect(startsPaused(game)).toBe(true);
  });

  it("[GAME-11] resuming replaces the stored pause, so a scene that starts later runs", () => {
    const game = registry();
    rememberPause(game, true);
    rememberPause(game, false);
    expect(startsPaused(game)).toBe(false);
  });
});
