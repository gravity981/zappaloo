import type { GuestFigure, WorldObjectAction } from "@zappaloo/shared";
import type { NpcState } from "./npc-crowd.ts";
import type { GuestState } from "./guest-crowd.ts";
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
  /** How many times a map has been entered in this game: the first entry and every portal (test hook, GAME-30). */
  entries: number;
  /** The camera: the map point at its centre, its zoom, and its size in game pixels (the canvas). */
  view: { x: number; y: number; zoom: number; width: number; height: number };
  /** The wandering guest figures of this map (test hook, PRES-01). */
  guests: GuestState[];
  /** The NPCs of this map (test hook, GAME-36). */
  npcs: NpcState[];
  /** The effects of the map: whether it has fog, how many cloud shadows and how many birds are there (test hook, GAME-31 – GAME-34). */
  atmosphere: { fog: boolean; clouds: number; birds: number };
  /** The silhouettes that show behind objects: the player's, how many figures' in all, the target marker's (test hook, GAME-42). */
  silhouettes: { player: boolean; figures: number; marker: boolean };
  /** The animated tile objects of this map and the frame each shows now (test hook, GAME-35). */
  tileAnimation: { objects: number; frames: number[] };
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
}

/** The words the engine shows, which the host supplies in its own language; the engine has none of its own. */
export interface GameTexts {
  /** Shown over the game while the map behind a portal is built (GAME-30). Without it, the overlay has no text. */
  loading?: string;
  /** The playful texts of the start screen (GAME-43), one per step of the loading; without them only the bar shows. */
  loadingSteps?: readonly string[];
  /** The name of the cross of a pinned speech bubble, for screen readers (PRES-10). */
  closeBubble?: string;
  /** The greeting of a guest who wrote none (PRES-10), e.g. "Hallo 🙂". */
  defaultGreeting?: string;
}

export interface GameEngineOptions {
  world: LoadedWorld;
  host: GameHost;
  transparent?: boolean;
  preserveDrawingBuffer?: boolean;
  guides?: GameGuides;
  view?: GameView;
  /** The words the game shows. */
  texts?: GameTexts;
  /** The figures of the attending guests that wander the maps (PRES-01); each walks on the map its id picks (PRES-02). */
  guests?: readonly GuestFigure[];
  /**
   * The title of what an action opens (GAME-40): a page's title, a minigame's name. The edge indicator and the label
   * of an object carry it; without a title (or without this function, as in the game preview) the object's own label
   * or name stands.
   */
  titleOf?: (action: WorldObjectAction) => string | undefined;
  /** The address of a guest's photo for the speech bubble; without it the bubble shows the initials. */
  guestPhoto?: (guest: GuestFigure) => string | undefined;
  /** The colour of the silhouettes of figures behind objects (GAME-42), as a number (0xRRGGBB): the event's accent colour. */
  silhouetteColor?: number;
  /** Shows the development diagnostics overlay (GAME-27); never set in a production build. */
  diagnostics?: boolean;
}
