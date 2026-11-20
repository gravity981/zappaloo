// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "../i18n/i18n.ts";
import de from "../i18n/locales/de/common.json";
import GameLoading from "./GameLoading.tsx";

beforeAll(async () => {
  await initI18n();
});

describe("the game before the engine starts (GAME-43)", () => {
  it("[GAME-43] shows the loading text in a black view that the stylesheet sizes like the game", () => {
    render(<GameLoading />);
    const view = screen.getByTestId("game-loading");
    expect(view.className).toBe("game-loading");
    expect(view.textContent).toBe(de.game.loading);
  });

  it("[GAME-43] the pool of playful texts is built into the app: about fifteen, none empty", () => {
    expect(de.game.loadingSteps.length).toBeGreaterThanOrEqual(12);
    expect(de.game.loadingSteps.every((text) => text.trim() !== "")).toBe(true);
    expect(new Set(de.game.loadingSteps).size).toBe(de.game.loadingSteps.length);
  });
});
