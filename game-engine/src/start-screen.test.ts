// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  hideStartScreen,
  pickStepText,
  setStartProgress,
  showStartScreen,
  startScreenIsUp,
  stepOf,
} from "./start-screen.ts";

function fakeGame(): { game: never; parent: HTMLElement } {
  const parent = document.createElement("div");
  document.body.append(parent);
  return { game: {} as never, parent };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("the start screen (GAME-43)", () => {
  it("[GAME-43] is a black screen with an empty bar, and goes when the game is ready", () => {
    const { game, parent } = fakeGame();
    showStartScreen(game, parent, ["Bäume werden gepflanzt"], () => 0);
    const screen = parent.querySelector<HTMLElement>('[data-testid="game-start"]');
    expect(screen?.style.background).toBe("rgb(0, 0, 0)");
    expect(startScreenIsUp(game)).toBe(true);
    hideStartScreen(game);
    expect(parent.querySelector('[data-testid="game-start"]')).toBeNull();
    expect(startScreenIsUp(game)).toBe(false);
    // Progress after it went does nothing.
    setStartProgress(game, 0.5);
  });

  it("[GAME-43] the bar follows the progress and never goes back; the text changes with each step", () => {
    const { game, parent } = fakeGame();
    const pool = ["a", "b", "c"];
    let next = 0;
    showStartScreen(game, parent, pool, () => (next++ % 3) / 3);
    const bar = parent.querySelector<HTMLElement>('[data-testid="game-start-bar"]');
    const text = parent.querySelector('[data-testid="game-start-text"]');
    expect(text?.textContent).not.toBe("");
    const first = text?.textContent;
    setStartProgress(game, 0.1);
    expect(text?.textContent).toBe(first);
    setStartProgress(game, 0.3);
    expect(text?.textContent).not.toBe(first);
    expect(bar?.style.width).toBe("30%");
    setStartProgress(game, 0.2);
    expect(bar?.style.width).toBe("30%");
    setStartProgress(game, 1);
    expect(bar?.style.width).toBe("100%");
  });

  it("[GAME-43] without texts from the host, the bar stands alone", () => {
    const { game, parent } = fakeGame();
    showStartScreen(game, parent, [], () => 0.5);
    setStartProgress(game, 0.6);
    expect(parent.querySelector('[data-testid="game-start-text"]')?.textContent).toBe("");
  });

  it("[GAME-43] a step text is picked at random from the pool and is not the one before", () => {
    const pool = ["a", "b", "c"];
    expect(pickStepText(pool, undefined, () => 0)).toBe("a");
    expect(pickStepText(pool, undefined, () => 0.99)).toBe("c");
    expect(pickStepText(pool, "a", () => 0)).toBe("b");
    expect(pickStepText(["only"], "only", () => 0)).toBe("only");
    expect(pickStepText([], undefined, () => 0)).toBeUndefined();
  });

  it("[GAME-43] the steps are the start, the loading in parts, and the build of the map", () => {
    expect([0, 0.2, 0.3, 0.6, 0.75, 0.95, 1].map(stepOf)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  });
});
