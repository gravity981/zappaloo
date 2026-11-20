import Phaser from "phaser";
import { ENGINE_CONFIG_REGISTRY_KEY, PIXEL_RATIO_REGISTRY_KEY, WORLD_SCENE_KEY } from "./host.ts";
import { showDiagnostics } from "./diagnostics.ts";
import { canvasBufferSize, canvasPixelRatio } from "./pixel-grid.ts";
import { WorldScene } from "./GameScene.ts";
import { isPlayedByHand } from "./manual-clock.ts";
import { rememberPause, setLoopAsleep } from "./pause.ts";
import { gameRandom } from "./random.ts";
import { releaseContext } from "./release-context.ts";
import { showStartScreen } from "./start-screen.ts";
import type { GameEngineOptions, GameGuides, GameSelection, GameView } from "./host.ts";

export type GameInstance = Phaser.Game;

export type GameMountOptions = GameEngineOptions & { parent: HTMLElement };

/** Creates the reusable Phaser game with host selection and callbacks. */
export function createGame({ parent, ...options }: GameMountOptions): GameInstance {
  // The canvas buffer has the size of the parent in device pixels (GAME-27). Phaser's RESIZE mode would use CSS pixels
  // and let the browser scale the canvas up, which makes the view step in coarse jumps while the camera follows.
  const ratio = canvasPixelRatio(window.devicePixelRatio);
  const initial = canvasBufferSize(parentSize(parent), ratio);
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    transparent: options.transparent ?? false,
    render: { preserveDrawingBuffer: options.preserveDrawingBuffer ?? false },
    scale: { mode: Phaser.Scale.NONE, width: initial.width, height: initial.height },
    scene: [WorldScene],
  });
  game.registry.set(ENGINE_CONFIG_REGISTRY_KEY, options);
  game.registry.set(PIXEL_RATIO_REGISTRY_KEY, ratio);
  keepCanvasSized(game, parent);
  // Black, with a bar, until the first map is ready (GAME-43).
  showStartScreen(game, parent, options.texts?.loadingSteps ?? [], gameRandom);
  setGameDiagnostics(game, options.diagnostics === true);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    setGameDiagnostics(game, false);
    // Phaser deletes its GL objects after this event but keeps the context: release it once it is done (PWA-07).
    const gl =
      game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer ? game.renderer.gl : null;
    const canvas = game.canvas;
    if (gl)
      setTimeout(() => {
        releaseContext(gl, canvas);
      }, 0);
  });
  return game;
}

const diagnosticsOverlays = new WeakMap<GameInstance, () => void>();

/** Shows or hides the development diagnostics overlay (frame rate, canvas size, camera step; GAME-27). */
export function setGameDiagnostics(game: GameInstance, on: boolean): void {
  const shown = diagnosticsOverlays.get(game);
  if (!on) {
    shown?.();
    diagnosticsOverlays.delete(game);
    return;
  }
  if (shown !== undefined) return;
  const parent = game.canvas.parentElement;
  if (parent === null) return;
  if (getComputedStyle(parent).position === "static") parent.style.position = "relative";
  diagnosticsOverlays.set(
    game,
    showDiagnostics(parent, {
      pixelRatio: () => canvasPixelRatio(window.devicePixelRatio),
      camera: () => {
        const scene = game.scene.getScene(WORLD_SCENE_KEY);
        if (!(scene instanceof WorldScene) || !scene.sys.isActive()) return undefined;
        const camera = scene.cameras.main;
        return {
          x: camera.midPoint.x,
          y: camera.midPoint.y,
          zoom: camera.zoom,
          width: camera.width,
          height: camera.height,
        };
      },
    }),
  );
}

function parentSize(parent: HTMLElement): { width: number; height: number } {
  return { width: parent.clientWidth, height: parent.clientHeight };
}

/** The canvas fills its parent in CSS pixels, and its buffer follows the parent's size in device pixels. */
function keepCanvasSized(game: GameInstance, parent: HTMLElement): void {
  const canvas = game.canvas;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  const observer = new ResizeObserver(() => {
    const ratio = canvasPixelRatio(window.devicePixelRatio);
    const size = canvasBufferSize(parentSize(parent), ratio);
    const ratioChanged = game.registry.get(PIXEL_RATIO_REGISTRY_KEY) !== ratio;
    if (ratioChanged) game.registry.set(PIXEL_RATIO_REGISTRY_KEY, ratio);
    if (ratioChanged || size.width !== game.scale.width || size.height !== game.scale.height) {
      game.scale.resize(size.width, size.height);
    }
  });
  observer.observe(parent);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    observer.disconnect();
  });
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

/** Gives the player another figure without restarting the map (AVA-04). */
export function setGameFigure(game: GameInstance, figureId: string): void {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene) scene.setFigure(figureId);
}

/**
 * Pauses the game while a page is open above it, and resumes it when the page is closed (GAME-11). The state is
 * kept even when the scene does not run yet; the scene applies it when it starts.
 */
export function setGamePaused(game: GameInstance, paused: boolean): void {
  rememberPause(game.registry, paused);
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  if (scene instanceof WorldScene && (scene.sys.isActive() || scene.sys.isPaused())) {
    scene.setPaused(paused);
    setLoopAsleep(game.loop, paused, isPlayedByHand(game));
  }
}

/** The clickable objects of the current map: names and positions in map pixels (test hook). */
export function getGameClickables(game: GameInstance): ReturnType<WorldScene["clickables"]> {
  const scene = game.scene.getScene(WORLD_SCENE_KEY);
  return scene instanceof WorldScene ? scene.clickables() : [];
}
