import type { WorldObjectAction } from "@zappaloo/shared";
import type { LoadedWorld } from "./world-data.ts";
import type { Point } from "./geometry.ts";

export const ENGINE_CONFIG_REGISTRY_KEY = "zappaloo.game-engine";
/** The pause the page asked for (GAME-11), kept in the game registry until the scene runs. */
export const PAUSED_REGISTRY_KEY = "zappaloo.game-paused";
/** The canvas's pixel ratio (device pixels per CSS pixel), kept up to date by the engine (GAME-27). */
export const PIXEL_RATIO_REGISTRY_KEY = "zappaloo.game-pixel-ratio";
export const WORLD_SCENE_KEY = "world";

export interface GameSelection {
  mapId: string;
  spawn: string;
  figureId?: string;
}

export interface GameGuides {
  collisions: boolean;
  borders: boolean;
  spawns: boolean;
  portals: boolean;
  grid: boolean;
  occlusion: boolean;
}

export interface GameView {
  artworkOnly: boolean;
  zoom: number;
}

export interface GameState {
  mapId: string;
  /** The player's logical foot position in map pixels, used for depth and triggers. */
  x: number;
  y: number;
  direction: string;
  /** How many times a clickable object has sparkled in this map (test hook). */
  sparkles: number;
  /** The marker's target and the id of the object or portal that glows, while a tap walk lasts (test hook, GAME-24). */
  walk: { marker: Point | null; glow: number | null };
  /** How many objects and portal arrows have a glow (test hook, GAME-29). */
  glows: number;
  /** The camera: the map point at its centre, its zoom, and its size in game pixels (the canvas). */
  view: { x: number; y: number; zoom: number; width: number; height: number };
}

export type GameStateReader = () => GameState;

/** What the player activated: a clickable object and what its action is (GAME-06). */
export interface GameActivation {
  mapId: string;
  object: string;
  label?: string;
  action: WorldObjectAction;
}

export interface GameHost {
  selection: GameSelection;
  rememberMap?: (mapId: string) => void;
  onStateChange?: (reader: GameStateReader | null) => void;
  onReady?: () => void;
  /** The player activated a clickable object; the host runs the action (overlay, reading panel, dialogue). */
  onActivate?: (activation: GameActivation) => void;
  /** The player tapped or clicked their own avatar (GAME-18); the host decides what that opens. */
  onPlayerTap?: () => void;
}

export interface GameEngineOptions {
  world: LoadedWorld;
  host: GameHost;
  transparent?: boolean;
  preserveDrawingBuffer?: boolean;
  guides?: GameGuides;
  view?: GameView;
  /** Shows the development diagnostics overlay (GAME-27); never set in a production build. */
  diagnostics?: boolean;
}
