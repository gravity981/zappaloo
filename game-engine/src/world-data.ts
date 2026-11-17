// Common preparation for production and preview adapters: validated public data becomes the plain data the scene
// draws. Transport and the mapping from asset paths to URLs belong to the host.
import {
  pixelLabMetadataSchema,
  publicWorldSchema,
  WORLD_DIRECTIONS,
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
}

export interface LoadedWorld {
  version: string;
  name: string;
  startMap: string;
  tileSize: TileSize;
  maps: Map<string, ParsedMap>;
  figures: FigureData[];
  /** Every image the world draws, by its texture key, with its URL. */
  images: Map<string, string>;
  /** The actions the admin assigned to clickable objects, by `<map id>/<object name>` (MAP-15). */
  actions: Map<string, WorldObjectAction>;
}

/** Inputs already loaded by a host adapter; the same path prepares authenticated and local packages. */
export interface WorldSource {
  summary: unknown;
  maps: ReadonlyMap<string, unknown>;
  figureMetadata: ReadonlyMap<string, unknown>;
  resolveAsset: (path: string) => string;
}

function assetPathOf(key: string, figureFolders: Map<string, string>): string | undefined {
  if (key.startsWith("tileset:")) return `tilesets/${key.slice("tileset:".length)}.png`;
  if (key.startsWith("frame:")) {
    const [, figure, ...rest] = key.split(":");
    const folder = figure === undefined ? undefined : figureFolders.get(figure);
    if (folder === undefined) return undefined;
    return `avatar/${folder === "" ? "" : `${folder}/`}${rest.join(":")}`;
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

  const figureFolders = new Map<string, string>();
  const figures: FigureData[] = [];
  for (const figure of summary.figures) {
    if (!source.figureMetadata.has(figure.metadata))
      throw new Error(`Missing figure metadata ${figure.metadata}`);
    const folder = figure.metadata.includes("/")
      ? figure.metadata.slice(0, figure.metadata.lastIndexOf("/"))
      : "";
    figureFolders.set(figure.id, folder);
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
    figures.push({
      id: figure.id,
      ...(figure.label === undefined ? {} : { label: figure.label }),
      size: { width: state.character.size.width, height: state.character.size.height },
      standing,
      walk,
    });
  }

  const images = new Map<string, string>();
  const keys = new Set<string>();
  for (const map of maps.values()) {
    for (const draw of [...map.ground, ...map.objects]) keys.add(draw.image.key);
  }
  for (const figure of figures) {
    for (const key of Object.values(figure.standing)) keys.add(key);
    for (const list of Object.values(figure.walk)) for (const key of list) keys.add(key);
  }
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
    images,
    actions: new Map(summary.actions.map((item) => [`${item.map}/${item.object}`, item.action])),
  };
}
