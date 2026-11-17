import Phaser from "phaser";
import { ENGINE_CONFIG_REGISTRY_KEY, WORLD_SCENE_KEY } from "./host.ts";
import { WorldScene } from "./GameScene.ts";
import type { GameEngineOptions, GameGuides, GameSelection, GameView } from "./host.ts";

export type GameInstance = Phaser.Game;

export type GameMountOptions = GameEngineOptions & { parent: HTMLElement };

/** Creates the reusable Phaser game with host selection and callbacks. */
export function createGame({ parent, ...options }: GameMountOptions): GameInstance {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    transparent: options.transparent ?? false,
    render: { preserveDrawingBuffer: options.preserveDrawingBuffer ?? false },
    scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
    scene: [WorldScene],
  });
  game.registry.set(ENGINE_CONFIG_REGISTRY_KEY, options);
  return game;
}

export function setGameGuides(game: GameInstance, guides: GameGuides): void {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene) scene.setGuides(guides);
}

export function setGameSelection(game: GameInstance, selection: GameSelection): void {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene) scene.setSelection(selection);
}

export function getGameRenderStack(game: GameInstance): { type: string; depth: number }[] {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (!(scene instanceof WorldScene)) throw new Error("the game world scene is not running");
  return scene.renderStack();
}

export function setGameView(game: GameInstance, view: GameView): void {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene) scene.setView(view);
}

export { WORLD_SCENE_KEY };

/** Pauses the game while a page is open above it, and resumes it when the page is closed (GAME-11). */
export function setGamePaused(game: GameInstance, paused: boolean): void {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene) scene.setPaused(paused);
}

/** The clickable objects of the current map: names and positions in map pixels (test hook). */
export function getGameClickables(game: GameInstance): ReturnType<WorldScene["clickables"]> {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  return scene instanceof WorldScene ? scene.clickables() : [];
}
