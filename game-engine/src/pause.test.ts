import { describe, expect, it } from "vitest";
import { PAUSED_REGISTRY_KEY } from "./host.ts";
import { rememberPause, setLoopAsleep, startsPaused, type PauseStore } from "./pause.ts";

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

describe("the game loop behind a page (GAME-44)", () => {
  function loop(running: boolean) {
    const calls: string[] = [];
    return {
      calls,
      running,
      sleep() {
        calls.push("sleep");
        this.running = false;
      },
      resetDelta() {
        calls.push("resetDelta");
      },
      wake() {
        calls.push("wake");
        this.running = true;
      },
    };
  }

  it("[GAME-44] the loop sleeps while a page is open, so the canvas is not drawn behind it", () => {
    const l = loop(true);
    setLoopAsleep(l, true, false);
    expect(l.calls).toEqual(["sleep"]);
  });

  it("[GAME-44] the loop wakes with a fresh time step when the page closes", () => {
    const l = loop(false);
    setLoopAsleep(l, false, false);
    expect(l.calls).toEqual(["resetDelta", "wake"]);
  });

  it("[GAME-44] a running loop is not woken again", () => {
    const l = loop(true);
    setLoopAsleep(l, false, false);
    expect(l.calls).toEqual([]);
  });

  it("[GAME-44] a loop that a test plays by hand is left alone", () => {
    const l = loop(false);
    setLoopAsleep(l, false, true);
    setLoopAsleep(l, true, true);
    expect(l.calls).toEqual([]);
  });
});
