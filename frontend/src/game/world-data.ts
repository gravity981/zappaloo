// Loading the active world for the game (sw-architecture.md 14.4, MAP-10, AVA-02): the world's summary, every map
// as Tiled JSON, and the metadata and frames of every figure. The loaded world is plain data; the game scene only
// draws it. Files come from `/api/world/<import id>/…`, which change with every import, so they are cached.
import {
  pixelLabMetadataSchema,
  publicWorldSchema,
  WORLD_DIRECTIONS,
  type PublicWorld,
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
}

/** The base of the world's files for an import id. */
export function worldBase(version: string): string {
  return `/api/world/${version}`;
}

/** The URL of a texture key: a tileset image (`tileset:<name>`) or a figure's frame (`frame:<figure>:<path>`). */
function urlOf(
  version: string,
  figureFolders: Map<string, string>,
  key: string,
): string | undefined {
  if (key.startsWith("tileset:"))
    return `${worldBase(version)}/tilesets/${key.slice("tileset:".length)}.png`;
  if (key.startsWith("frame:")) {
    const [, figure, ...rest] = key.split(":");
    const folder = figure === undefined ? undefined : figureFolders.get(figure);
    if (folder === undefined) return undefined;
    return `${worldBase(version)}/avatar/${folder}/${rest.join(":")}`;
  }
  return undefined;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);
  return (await response.json()) as unknown;
}

/** Loads the active world; undefined when no world is imported. */
export async function loadWorld(): Promise<LoadedWorld | undefined> {
  const summary: PublicWorld | null = publicWorldSchema
    .nullable()
    .parse(await fetchJson("/api/world"));
  if (summary === null) return undefined;
  const version = summary.version;
  const base = worldBase(version);

  const maps = new Map<string, ParsedMap>();
  for (const id of summary.maps) {
    maps.set(id, parseMap(id, await fetchJson(`${base}/maps/${id}.json`)));
  }

  const figureFolders = new Map<string, string>();
  const figures: FigureData[] = [];
  for (const figure of summary.figures) {
    const folder = figure.metadata.includes("/")
      ? figure.metadata.slice(0, figure.metadata.lastIndexOf("/"))
      : "";
    figureFolders.set(figure.id, folder);
    const metadata = pixelLabMetadataSchema.parse(
      await fetchJson(`${base}/avatar/${figure.metadata}`),
    );
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
    const url = urlOf(version, figureFolders, key);
    if (url !== undefined) images.set(key, url);
  }

  return {
    version,
    name: summary.name,
    startMap: summary.startMap,
    tileSize: { width: summary.tileWidth, height: summary.tileHeight },
    maps,
    figures,
    images,
  };
}
