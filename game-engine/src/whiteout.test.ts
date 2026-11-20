// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideWhiteout, showWhiteout } from "./whiteout.ts";

function fakeGame(): { game: never; parent: HTMLElement } {
  const parent = document.createElement("div");
  document.body.append(parent);
  const canvas = document.createElement("canvas");
  parent.append(canvas);
  return { game: { canvas } as never, parent };
}
const layer = (parent: HTMLElement) => parent.querySelector('[data-testid="map-whiteout"]');

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("the white screen between two maps (GAME-30)", () => {
  it("[GAME-30] covers the game with white at once, and only once", () => {
    const { game, parent } = fakeGame();
    showWhiteout(game);
    showWhiteout(game);
    expect(parent.querySelectorAll('[data-testid="map-whiteout"]')).toHaveLength(1);
    expect((layer(parent) as HTMLElement).style.background).toBe("rgb(255, 255, 255)");
    expect((layer(parent) as HTMLElement).style.opacity).toBe("");
  });

  it("[GAME-30] goes two frames after it is asked to, so that the flash of the new map has begun", () => {
    vi.useFakeTimers();
    const { game, parent } = fakeGame();
    showWhiteout(game);
    hideWhiteout(game);
    expect(layer(parent)).not.toBeNull();
    vi.advanceTimersByTime(17);
    expect(layer(parent)).not.toBeNull();
    vi.advanceTimersByTime(40);
    expect(layer(parent)).toBeNull();
  });

  it("[GAME-30] taking it down when it is not up does nothing", () => {
    const { game } = fakeGame();
    expect(() => {
      hideWhiteout(game);
    }).not.toThrow();
  });
});
