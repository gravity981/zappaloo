// The map as the game draws and checks it (sw-architecture.md 14.1, 14.2, 14.4, MAP-02, GAME-02, GAME-03, GAME-19):
// the ground from the visible tile layers in order (group layers read recursively, hidden layers not drawn), the
// tile objects with their alignment, offset and scale, the collisions, the spawn points and the portals, and the
// occlusion lines of the objects. Pure: it takes the parsed Tiled map and returns plain data.
import {
  tiledMapSchema,
  type TiledLayer,
  type TiledObject,
  type TiledTile,
  type TiledTileset,
} from "@zappaloo/shared";
import { rectangleToPolygon, type Point, type TileSize, tileToPixel } from "./geometry.ts";
import type { Obstacles } from "./collision.ts";
import type { Occluder } from "./draw-order.ts";

/** A picture of a tile: the texture it comes from, the part of it to draw, and its guides in its own pixels. */
export interface TileImage {
  /** The texture key of the image file (`tileset:<name>`, see world-data.ts). */
  key: string;
  /** The image's size in pixels. */
  width: number;
  height: number;
  /** The part of the image that is the tile (a sheet's cell); the whole image otherwise. */
  crop: { x: number; y: number; width: number; height: number };
  /** The tileset's tile offset in pixels. */
  offset: Point;
  /** Collision polygons of the tile, in the image's pixels. */
  collision: Point[][];
  /** The occlusion line of the tile, in the image's pixels. */
  occlusion?: Point[];
}

/** One drawn tile: its image and where it goes, the top-left corner in the map's pixel space. */
export interface TileDraw {
  image: TileImage;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The depth of the object (the y of its bottom edge), or of the ground layer (below everything). */
  depth: number;
}

export interface PortalArea {
  name: string;
  polygon: Point[];
  targetMap?: string;
  targetSpawn?: string;
}

export interface ParsedMap {
  id: string;
  name: string;
  columns: number;
  rows: number;
  size: TileSize;
  /** The ground tiles, in layer order. */
  ground: TileDraw[];
  /** The tile objects, drawn in depth order with the figures. */
  objects: TileDraw[];
  /** The objects with an occlusion line (GAME-19). */
  occluders: Occluder[];
  obstacles: Obstacles;
  spawns: Map<string, Point>;
  portals: PortalArea[];
  /** The number of tile layers that are drawn (for the tests and the test hook). */
  drawnLayers: number;
}

/** The tile ids of the flattened layers, group layers read recursively, in the order of the file. */
function flatten(
  layers: TiledLayer[],
): Extract<TiledLayer, { type: "tilelayer" | "objectgroup" }>[] {
  return layers.flatMap((layer) => (layer.type === "group" ? flatten(layer.layers) : [layer]));
}

/** The values of a tile layer: an array, or Base64 of little-endian 32-bit ids. */
function tileValues(data: number[] | string, encoding: "csv" | "base64" | undefined): number[] {
  if (Array.isArray(data)) return data;
  if (encoding !== "base64") return [];
  const bytes = atob(data);
  const values: number[] = [];
  for (let offset = 0; offset + 4 <= bytes.length; offset += 4) {
    values.push(
      (bytes.charCodeAt(offset) |
        (bytes.charCodeAt(offset + 1) << 8) |
        (bytes.charCodeAt(offset + 2) << 16) |
        (bytes.charCodeAt(offset + 3) << 24)) >>>
        0,
    );
  }
  return values;
}

const GID_MASK = 0x1fffffff;

/** The file name of a tileset image: `../tilesets/<name>.png` → `tileset:<name>`. */
function imageKey(path: string): string {
  const name = path.replace(/^.*\//, "").replace(/\.png$/, "");
  return `tileset:${name}`;
}

interface TileSource {
  firstgid: number;
  lastgid: number;
  /** Resolves a global tile id (without flip bits) to its image, or undefined. */
  image: (gid: number) => TileImage | undefined;
}

/** The tilesets of a map as sources of tile images, in order of their first id. */
function tileSources(tilesets: TiledTileset[]): TileSource[] {
  const sources: TileSource[] = [];
  for (const set of tilesets) {
    const offset = { x: set.tileoffset?.x ?? 0, y: set.tileoffset?.y ?? 0 };
    if (set.tiles !== undefined) {
      const byGid = new Map<number, TiledTile>();
      for (const tile of set.tiles) byGid.set(set.firstgid + tile.id, tile);
      const gids = [...byGid.keys()];
      sources.push({
        firstgid: Math.min(...gids),
        lastgid: Math.max(...gids),
        image: (gid) => {
          const tile = byGid.get(gid);
          if (tile?.image === undefined) return undefined;
          const width = tile.imagewidth ?? set.tilewidth;
          const height = tile.imageheight ?? set.tileheight;
          return {
            key: imageKey(tile.image),
            width,
            height,
            crop: { x: 0, y: 0, width, height },
            offset,
            collision: collisionOf(tile),
            occlusion: occlusionOf(tile),
          };
        },
      });
      continue;
    }
    const columns = set.columns ?? 0;
    const count = set.tilecount ?? columns * Math.floor((set.imageheight ?? 0) / set.tileheight);
    const margin = set.margin ?? 0;
    const spacing = set.spacing ?? 0;
    sources.push({
      firstgid: set.firstgid,
      lastgid: set.firstgid + count - 1,
      image: (gid) => {
        if (set.image === undefined || columns <= 0) return undefined;
        const id = gid - set.firstgid;
        const column = id % columns;
        const row = Math.floor(id / columns);
        return {
          key: imageKey(set.image),
          width: set.tilewidth,
          height: set.tileheight,
          crop: {
            x: margin + column * (set.tilewidth + spacing),
            y: margin + row * (set.tileheight + spacing),
            width: set.tilewidth,
            height: set.tileheight,
          },
          offset,
          collision: [],
        };
      },
    });
  }
  return sources.sort((a, b) => a.firstgid - b.firstgid);
}

/** The collision polygons of a collection tile: guides named `collision`, polygons or rectangles. */
function collisionOf(tile: TiledTile): Point[][] {
  const shapes: Point[][] = [];
  for (const guide of tile.objectgroup?.objects ?? []) {
    if (guide.name !== "collision") continue;
    if (guide.polygon !== undefined)
      shapes.push(guide.polygon.map((p) => ({ x: guide.x + p.x, y: guide.y + p.y })));
    else if (guide.width !== undefined && guide.height !== undefined) {
      shapes.push(rectangleToPolygon(guide.x, guide.y, guide.width, guide.height));
    }
  }
  return shapes;
}

/** The occlusion line of a collection tile, its polyline named `occlusion`. */
function occlusionOf(tile: TiledTile): Point[] | undefined {
  const guide = tile.objectgroup?.objects.find(
    (item) => item.name === "occlusion" && item.polyline !== undefined,
  );
  return guide?.polyline?.map((p) => ({ x: guide.x + p.x, y: guide.y + p.y }));
}

function propertyOf(object: TiledObject, name: string): unknown {
  return object.properties?.find((property) => property.name === name)?.value;
}

/** Parses and prepares a map of the world. `json` is the Tiled JSON as the server sends it. */
export function parseMap(id: string, json: unknown): ParsedMap {
  const map = tiledMapSchema.parse(json);
  const size: TileSize = { width: map.tilewidth, height: map.tileheight };
  const sources = tileSources(map.tilesets);
  const imageOf = (flagged: number): TileImage | undefined => {
    const gid = flagged & GID_MASK;
    const source = sources.find((item) => gid >= item.firstgid && gid <= item.lastgid);
    return source?.image(gid);
  };
  const layers = flatten(map.layers);

  const ground: TileDraw[] = [];
  const blockedCells = new Set<string>();
  let drawnLayers = 0;
  let order = 0;
  for (const layer of layers) {
    if (layer.type !== "tilelayer") continue;
    const values = tileValues(layer.data, layer.encoding);
    const isCollision = layer.name === "collision";
    if (isCollision) {
      values.forEach((value, index) => {
        if ((value & GID_MASK) === 0) return;
        const column = index % layer.width;
        const row = Math.floor(index / layer.width);
        blockedCells.add(`${String(column)},${String(row)}`);
      });
      continue;
    }
    if (layer.visible === false) continue;
    drawnLayers += 1;
    order += 1;
    values.forEach((value, index) => {
      const image = imageOf(value);
      if (image === undefined) return;
      const column = index % layer.width;
      const row = Math.floor(index / layer.width);
      // A tile's image sits with its bottom centre at the bottom corner of its cell (Tiled's isometric rule).
      const bottom = tileToPixel({ x: column + 1, y: row + 1 }, size);
      ground.push({
        image,
        x: bottom.x - image.width / 2 + image.offset.x,
        y: bottom.y - image.height + image.offset.y,
        width: image.width,
        height: image.height,
        depth: -1_000_000 + order * 1000 + row * 0.001 + column * 0.000001,
      });
    });
  }

  const objects: TileDraw[] = [];
  const occluders: Occluder[] = [];
  const solids: Point[][] = [];
  const borders: Point[][] = [];
  const spawns = new Map<string, Point>();
  const portals: PortalArea[] = [];
  for (const layer of layers) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects) {
      const type = object.type ?? object.class ?? "";
      if (object.gid !== undefined) {
        const image = imageOf(object.gid);
        if (image === undefined) continue;
        // A tile object sits with its bottom-left corner at (x, y); it may be scaled.
        const width = object.width ?? image.width;
        const height = object.height ?? image.height;
        const scaleX = image.width === 0 ? 1 : width / image.width;
        const scaleY = image.height === 0 ? 1 : height / image.height;
        const x = object.x + image.offset.x * scaleX;
        const y = object.y - height + image.offset.y * scaleY;
        const toPixel = (p: Point): Point => ({ x: x + p.x * scaleX, y: y + p.y * scaleY });
        if (layer.visible !== false) {
          objects.push({ image, x, y, width, height, depth: object.y });
        }
        for (const shape of image.collision) solids.push(shape.map(toPixel));
        if (image.occlusion !== undefined) {
          occluders.push({ depth: object.y, line: image.occlusion.map(toPixel) });
        }
        continue;
      }
      const polygon = polygonOf(object);
      if (type === "spawn") {
        spawns.set(object.name ?? "", { x: object.x, y: object.y });
      } else if (type === "portal" && polygon !== undefined) {
        portals.push({
          name: object.name ?? "",
          polygon,
          targetMap: stringOf(propertyOf(object, "targetMap")),
          targetSpawn: stringOf(propertyOf(object, "targetSpawn")),
        });
      } else if (type === "border" && polygon !== undefined) {
        borders.push(polygon);
      } else if (type === "collision" && polygon !== undefined) {
        solids.push(polygon);
      }
    }
  }

  return {
    id,
    name: stringOf(map.properties?.find((property) => property.name === "name")?.value) ?? id,
    columns: map.width,
    rows: map.height,
    size,
    ground,
    objects,
    occluders,
    obstacles: { size, columns: map.width, rows: map.height, blockedCells, solids, borders },
    spawns,
    portals,
    drawnLayers,
  };
}

/** The polygon of a rectangle or polygon object, in the map's pixel space. Undefined for other shapes. */
function polygonOf(object: TiledObject): Point[] | undefined {
  if (object.polygon !== undefined)
    return object.polygon.map((p) => ({ x: object.x + p.x, y: object.y + p.y }));
  if (object.point === true || object.gid !== undefined) return undefined;
  if (object.width === undefined || object.height === undefined) return undefined;
  return rectangleToPolygon(object.x, object.y, object.width, object.height);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
