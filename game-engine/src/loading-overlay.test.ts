// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideLoadingOverlay, showLoadingOverlay } from "./loading-overlay.ts";

function fakeGame(): { game: never; parent: HTMLElement } {
  const parent = document.createElement("div");
  document.body.append(parent);
  const canvas = document.createElement("canvas");
  parent.append(canvas);
  return { game: { canvas } as never, parent };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("the loading overlay (GAME-30)", () => {
  it("[GAME-30] covers the game with the host's word for loading, and goes when the map is ready", () => {
    const { game, parent } = fakeGame();
    showLoadingOverlay(game, "Lädt …");
    const overlay = parent.querySelector('[data-testid="map-loading"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toBe("Lädt …");
    hideLoadingOverlay(game);
    expect(parent.querySelector('[data-testid="map-loading"]')).toBeNull();
  });

  it("[GAME-30] without a word from the host, it is the grey veil alone, and it is put up only once", () => {
    const { game, parent } = fakeGame();
    showLoadingOverlay(game, undefined);
    showLoadingOverlay(game, undefined);
    expect(parent.querySelectorAll('[data-testid="map-loading"]')).toHaveLength(1);
    expect(parent.querySelector('[data-testid="map-loading"]')?.textContent).toBe("");
    hideLoadingOverlay(game);
    // Hiding an overlay that is not up does nothing.
    hideLoadingOverlay(game);
  });

  it("[GAME-30] an overlay that is never taken down, because the load failed, goes by itself", () => {
    vi.useFakeTimers();
    const { game, parent } = fakeGame();
    showLoadingOverlay(game, "Lädt …");
    vi.advanceTimersByTime(19_000);
    expect(parent.querySelector('[data-testid="map-loading"]')).not.toBeNull();
    vi.advanceTimersByTime(2_000);
    expect(parent.querySelector('[data-testid="map-loading"]')).toBeNull();
  });
});
