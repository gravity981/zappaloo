// Common preparation for production and preview adapters: validated public data becomes the plain data the scene
// draws. Transport and the mapping from asset paths to URLs belong to the host.
import {
  pixelLabBirdSchema,
  pixelLabDirectionsSchema,
  pixelLabMetadataSchema,
  publicWorldSchema,
  WORLD_DIRECTIONS,
  type PublicNpc,
  type PublicWorld,
  type WorldObjectAction,
} from "@zappaloo/shared";
import type { Direction } from "./movement.ts";
import { parseMap, type ParsedMap } from "./map-model.ts";
import type { TileSize } from "./geometry.ts";

/** A figure the guest can be: its frames, by direction, as texture keys. */
export interface FigureData {
  id: string;
  label?: string;
  /** The canvas of every frame, in pixels. */
  size: { width: number; height: number };
  standing: Record<Direction, string>;
  walk: Record<Direction, string[]>;
  /** The wave an NPC plays while it stands (format version 3), when the figure has one. */
  wave?: Record<Direction, string[]>;
}

/** The bird of the world (format version 3, GAME-32): the flying frames to the east and the west, as texture keys. */
export interface BirdData {
  /** The canvas of every frame, in pixels. */
  size: { width: number; height: number };
  flying: { east: string[]; west: string[] };
}

export interface LoadedWorld {
  version: string;
  name: string;
  startMap: string;
  tileSize: TileSize;
  maps: Map<string, ParsedMap>;
  figures: FigureData[];
  /** The bird, when the world has one; without it there are no birds. */
  bird?: BirdData;
  /** Every image the world draws, by its texture key, with its URL. */
  images: Map<string, string>;
  /** The actions the admin assigned to clickable objects, by `<map id>/<object name>` (MAP-15). */
  actions: Map<string, WorldObjectAction>;
  /** The NPCs whose action is a dialogue, by `<map id>/<NPC name>` (MAP-21, CNT-09): figure name, greeting and portrait. */
  npcs: Map<string, PublicNpc>;
  /** The figure names of the dialogues by their ids; they name the objects and NPCs that show one (GAME-40). */
  dialogues: Map<string, string>;
  /**
   * The `showIndicator` the admin set for objects and NPCs, by `<map id>/<name>`; one that is not listed shows its edge
   * indicator and label (GAME-26, GAME-41).
   */
  showIndicator: Map<string, boolean>;
}

/** Inputs already loaded by a host adapter; the same path prepares authenticated and local packages. */
export interface WorldSource {
  summary: unknown;
  maps: ReadonlyMap<string, unknown>;
  figureMetadata: ReadonlyMap<string, unknown>;
  /** The bird's PixelLab metadata (`ambient/bird/metadata.json`), when the summary says the world has a bird. */
  birdMetadata?: unknown;
  resolveAsset: (path: string) => string;
}

/** The texture key prefix of the bird's frames: a figure id is a valid id, so `$bird` cannot clash with one. */
const BIRD_ID = "$bird";

function assetPathOf(key: string, folders: Map<string, string>): string | undefined {
  if (key.startsWith("tileset:")) return `tilesets/${key.slice("tileset:".length)}.png`;
  if (key.startsWith("frame:")) {
    const [, owner, ...rest] = key.split(":");
    const folder = owner === undefined ? undefined : folders.get(owner);
    if (folder === undefined) return undefined;
    return `${folder}/${rest.join(":")}`;
  }
  return undefined;
}

/** Validates and prepares public world data without knowing how it was loaded or where its assets live. */
export function prepareWorld(source: WorldSource): LoadedWorld {
  const summary: PublicWorld = publicWorldSchema.parse(source.summary);
  const maps = new Map<string, ParsedMap>();
  for (const id of summary.maps) {
    if (!source.maps.has(id)) throw new Error(`Missing map ${id}`);
    maps.set(id, parseMap(id, source.maps.get(id)));
  }

  // The folder of the frames of each figure and of the bird, as the path in the package.
  const figureFolders = new Map<string, string>();
  const figures: FigureData[] = [];
  for (const figure of summary.figures) {
    if (!source.figureMetadata.has(figure.metadata))
      throw new Error(`Missing figure metadata ${figure.metadata}`);
    const folder = figure.metadata.includes("/")
      ? figure.metadata.slice(0, figure.metadata.lastIndexOf("/"))
      : "";
    figureFolders.set(figure.id, folder === "" ? "avatar" : `avatar/${folder}`);
    const metadata = pixelLabMetadataSchema.parse(source.figureMetadata.get(figure.metadata));
    const state = metadata.states[0];
    if (state === undefined) continue;
    const frame = (path: string) => `frame:${figure.id}:${path}`;
    const standing = Object.fromEntries(
      WORLD_DIRECTIONS.map((direction) => [direction, frame(state.frames.rotations[direction])]),
    ) as Record<Direction, string>;
    const walk = Object.fromEntries(
      WORLD_DIRECTIONS.map((direction) => [
        direction,
        state.frames.animations.walking[direction].map(frame),
      ]),
    ) as Record<Direction, string[]>;
    // The animation the figure names as its wave, in the four directions (validated on import).
    const waveFrames =
      figure.wave === undefined
        ? undefined
        : pixelLabDirectionsSchema.safeParse(
            (state.frames.animations as Record<string, unknown>)[figure.wave],
          );
    const wave = waveFrames?.success
      ? (Object.fromEntries(
          WORLD_DIRECTIONS.map((direction) => [direction, waveFrames.data[direction].map(frame)]),
        ) as Record<Direction, string[]>)
      : undefined;
    figures.push({
      id: figure.id,
      ...(figure.label === undefined ? {} : { label: figure.label }),
      size: { width: state.character.size.width, height: state.character.size.height },
      standing,
      walk,
      ...(wave === undefined ? {} : { wave }),
    });
  }

  // The bird: only the frames of its flight to the east and the west are drawn.
  let bird: BirdData | undefined;
  if (summary.bird && source.birdMetadata !== undefined) {
    const state = pixelLabBirdSchema.parse(source.birdMetadata).states[0];
    if (state !== undefined) {
      figureFolders.set(BIRD_ID, "ambient/bird");
      const frame = (path: string) => `frame:${BIRD_ID}:${path}`;
      bird = {
        size: { width: state.character.size.width, height: state.character.size.height },
        flying: {
          east: state.frames.animations.flying.east.map(frame),
          west: state.frames.animations.flying.west.map(frame),
        },
      };
    }
  }

  const images = new Map<string, string>();
  const keys = new Set<string>();
  for (const map of maps.values()) {
    for (const draw of [...map.ground, ...map.objects]) {
      keys.add(draw.image.key);
      // The pictures of the frames of a tile animation (GAME-35).
      for (const frame of draw.image.animation ?? []) keys.add(frame.key);
    }
  }
  for (const figure of figures) {
    for (const key of Object.values(figure.standing)) keys.add(key);
    for (const list of Object.values(figure.walk)) for (const key of list) keys.add(key);
    for (const list of Object.values(figure.wave ?? {})) for (const key of list) keys.add(key);
  }
  for (const key of [...(bird?.flying.east ?? []), ...(bird?.flying.west ?? [])]) keys.add(key);
  for (const key of keys) {
    const path = assetPathOf(key, figureFolders);
    if (path !== undefined) images.set(key, source.resolveAsset(path));
  }

  return {
    version: summary.version,
    name: summary.name,
    startMap: summary.startMap,
    tileSize: { width: summary.tileWidth, height: summary.tileHeight },
    maps,
    figures,
    ...(bird === undefined ? {} : { bird }),
    images,
    actions: new Map(summary.actions.map((item) => [`${item.map}/${item.object}`, item.action])),
    npcs: new Map(summary.npcs.map((item) => [`${item.map}/${item.name}`, item])),
    dialogues: new Map(summary.dialogues.map((item) => [item.id, item.name])),
    showIndicator: new Map(
      summary.indicators.map((item) => [`${item.map}/${item.object}`, item.showIndicator]),
    ),
  };
}
