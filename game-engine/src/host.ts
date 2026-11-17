import type { LoadedWorld } from "./world-data.ts";

export const ENGINE_CONFIG_REGISTRY_KEY = "zappaloo.game-engine";
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
  occlusion: boolean;
  grid: boolean;
}

export interface GameView {
  artworkOnly: boolean;
  zoom: number;
}

export interface GameState {
  mapId: string;
  /** The player's position in the map's pixel space. */
  x: number;
  y: number;
  direction: string;
  /** The camera: the map point at its centre, its zoom, and its size in game pixels (the canvas). */
  view: { x: number; y: number; zoom: number; width: number; height: number };
}

export type GameStateReader = () => GameState;

export interface GameHost {
  selection: GameSelection;
  rememberMap?: (mapId: string) => void;
  onStateChange?: (reader: GameStateReader | null) => void;
  onReady?: () => void;
}

export interface GameEngineOptions {
  world: LoadedWorld;
  host: GameHost;
  transparent?: boolean;
  preserveDrawingBuffer?: boolean;
  guides?: GameGuides;
  view?: GameView;
}
