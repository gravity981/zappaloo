import Phaser from "phaser";
import { ENGINE_CONFIG_REGISTRY_KEY, WORLD_SCENE_KEY } from "./host.ts";
import { WorldScene } from "./GameScene.ts";
import type { GameEngineOptions } from "./host.ts";

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

export { WORLD_SCENE_KEY };
