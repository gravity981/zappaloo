// The map as the game draws and checks it (sw-architecture.md 14.1, 14.2, 14.4, MAP-02, GAME-02, GAME-03, GAME-19):
// the visible ground layers in order, bottom-aligned unscaled tile objects, collisions, spawn points and portals.
// Pure: it takes the parsed Tiled map and returns plain data.
import {
  presetActionOf,
  tiledMapSchema,
  type WorldObjectAction,
  type TiledLayer,
  type TiledObject,
  type TiledTile,
  type TiledTileset,
} from "@zappaloo/shared";
import {
  rectangleToPolygon,
  type Point,
  type TileSize,
  tiledTileObjectToWorld,
  tiledToWorld,
  tileToPixel,
} from "./geometry.ts";
import type { Obstacles } from "./collision.ts";
import type { Occluder } from "./draw-order.ts";

/** A picture of a tile: the texture it comes from, the part of it to draw, and its guides in its own pixels. */
export interface TileImage {
  /** The texture key of the image file (`tileset:<name>`, resolved by world-data.ts). */
  key: string;
  /** The image's size in pixels. */
  width: number;
  height: number;
  /** The part of the image that is the tile (a sheet's cell); the whole image otherwise. */
  crop: { x: number; y: number; width: number; height: number };
  /** Whether this is a standalone image from an image-collection tileset. */
  collection: boolean;
  /** Collision polygons of the tile, in the image's pixels. */
  collision: Point[][];
  /** The trigger area of a portal tile (its polygon named `trigger`), in the image's pixels. */
  trigger?: Point[];
  /** The occlusion polyline of the tile, in the image's pixels. */
  occlusion?: Point[];
  /** The frames of the tile's animation (format version 3), each with its picture's texture key; the first frame is the tile itself. */
  animation?: TileAnimationFrame[];
}

/** One frame of a tile animation: the texture of its picture and how long it stays, in milliseconds. */
export interface TileAnimationFrame {
  key: string;
  duration: number;
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
  /** The Tiled id of a tile object (not of a ground tile): the effects of portals and clickables find it by this. */
  objectId?: number;
}

/** A clickable object (14.2, GAME-05): where it is, where the avatar stops, and the preset of its action. */
export interface ClickableArea {
  name: string;
  /** The label for the prompt, if the object has one. */
  label?: string;
  /** An easter egg: it does not sparkle (GAME-08). */
  hidden: boolean;
  /** The Tiled id of a tile object (its drawn sprite shines, GAME-15); undefined for a rectangle or polygon. */
  objectId?: number;
  /** The shape of the object in the map's pixel space. */
  polygon: Point[];
  /** Where the avatar stops: the `approach` point, or below the object's bottom edge (14.2). */
  approach: Point;
  /** The preset of the Tiled file; the admin's assignment replaces it (MAP-15). */
  preset?: WorldObjectAction;
}

export interface PortalArea {
  name: string;
  /** The Tiled id of the portal's tile object: its arrow, which wobbles (GAME-15). */
  objectId: number;
  polygon: Point[];
  targetMap?: string;
  targetSpawn?: string;
}

/** The map properties `clouds`, `birds` and `fog` (14.2): an effect is on unless its property is `false`. */
export interface MapAtmosphere {
  clouds: boolean;
  birds: boolean;
  fog: boolean;
}

export interface ParsedMap {
  id: string;
  name: string;
  columns: number;
  rows: number;
  size: TileSize;
  /** The validated Tiled map, also used by Phaser's native sheet tile-layer renderer. */
  source: ReturnType<typeof tiledMapSchema.parse>;
  /** The ground tiles, in layer order. */
  ground: TileDraw[];
  /** The tile objects, drawn in depth order with the figures. */
  objects: TileDraw[];
  /** The occlusion lines of visible tile objects, translated to world pixel coordinates. */
  occluders: Occluder[];
  obstacles: Obstacles;
  spawns: Map<string, Point>;
  portals: PortalArea[];
  /** The wander areas (`type = wander`) in the map's pixel space, where guest figures walk (PRES-02). */
  wanders: Point[][];
  clickables: ClickableArea[];
  /** Which effects the map has (format version 3, GAME-34): each is on unless the map property says `false`. */
  atmosphere: MapAtmosphere;
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
export function tilesetImageKey(path: string): string {
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
    // A tileset with an image is a sheet, even when Tiled wrote per-tile data (properties) into it.
    if (set.image === undefined && set.tiles !== undefined) {
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
            key: tilesetImageKey(tile.image),
            width,
            height,
            crop: { x: 0, y: 0, width, height },
            collection: true,
            collision: collisionOf(tile),
            trigger: triggerOf(tile),
            occlusion: occlusionOf(tile),
            ...animationOf(tile, byGid, set.firstgid),
          };
        },
      });
      continue;
    }
    const margin = set.margin ?? 0;
    const spacing = set.spacing ?? 0;
    const derivedColumns =
      set.imagewidth === undefined
        ? 0
        : Math.floor((set.imagewidth - margin * 2 + spacing) / (set.tilewidth + spacing));
    const columns = set.columns !== undefined && set.columns > 0 ? set.columns : derivedColumns;
    const rows =
      set.imageheight === undefined
        ? 0
        : Math.floor((set.imageheight - margin * 2 + spacing) / (set.tileheight + spacing));
    const count = set.tilecount ?? columns * rows;
    sources.push({
      firstgid: set.firstgid,
      lastgid: set.firstgid + count - 1,
      image: (gid) => {
        if (set.image === undefined || columns <= 0) return undefined;
        const id = gid - set.firstgid;
        const column = id % columns;
        const row = Math.floor(id / columns);
        return {
          key: tilesetImageKey(set.image),
          width: set.tilewidth,
          height: set.tileheight,
          crop: {
            x: margin + column * (set.tilewidth + spacing),
            y: margin + row * (set.tileheight + spacing),
            width: set.tilewidth,
            height: set.tileheight,
          },
          collection: false,
          collision: [],
        };
      },
    });
  }
  return sources.sort((a, b) => a.firstgid - b.firstgid);
}

/** The animation of a collection tile as frames with texture keys; frames without a picture are left out. */
function animationOf(
  tile: TiledTile,
  byGid: ReadonlyMap<number, TiledTile>,
  firstgid: number,
): { animation: TileAnimationFrame[] } | undefined {
  const frames: TileAnimationFrame[] = [];
  for (const frame of tile.animation ?? []) {
    const image = byGid.get(firstgid + frame.tileid)?.image;
    if (image !== undefined) frames.push({ key: tilesetImageKey(image), duration: frame.duration });
  }
  return frames.length > 1 ? { animation: frames } : undefined;
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

/** The trigger area of a portal tile: its polygon named `trigger` (14.2, changed 2026-11-16). */
function triggerOf(tile: TiledTile): Point[] | undefined {
  const guide = tile.objectgroup?.objects.find((item) => item.name === "trigger");
  if (guide === undefined) return undefined;
  if (guide.polygon !== undefined)
    return guide.polygon.map((p) => ({ x: guide.x + p.x, y: guide.y + p.y }));
  if (guide.width === undefined || guide.height === undefined) return undefined;
  return rectangleToPolygon(guide.x, guide.y, guide.width, guide.height);
}

/** The occlusion polyline of a collection tile, in its image's pixel coordinates. */
function occlusionOf(tile: TiledTile): Point[] | undefined {
  const guide = tile.objectgroup?.objects.find((item) => item.name === "occlusion");
  if (guide?.polyline === undefined) return undefined;
  return guide.polyline.map((point) => ({
    x: guide.x + point.x,
    y: guide.y + point.y,
  }));
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
      // Like Phaser's isometric tile layers, a tile is drawn with its top-left at the top corner of its cell.
      const top = tileToPixel({ x: column, y: row }, size);
      ground.push({
        image,
        x: top.x,
        y: top.y + size.height - image.height,
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
  const wanders: Point[][] = [];
  const spawns = new Map<string, Point>();
  const portals: PortalArea[] = [];
  const clickables: (Omit<ClickableArea, "approach"> & { approachName?: string })[] = [];
  const points = new Map<string, Point>();
  const toScreen = (x: number, y: number): Point => tiledToWorld({ x, y }, size);
  for (const layer of layers) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects) {
      const type = object.type ?? object.class ?? "";
      if (object.gid !== undefined) {
        const image = imageOf(object.gid);
        if (image === undefined) continue;
        const anchor = tiledTileObjectToWorld({ x: object.x, y: object.y }, size);
        const x = anchor.x - image.width / 2;
        const y = anchor.y - image.height;
        const toPixel = (p: Point): Point => ({ x: x + p.x, y: y + p.y });
        if (layer.visible !== false) {
          objects.push({
            image,
            x,
            y,
            width: image.width,
            height: image.height,
            depth: anchor.y,
            objectId: object.id,
          });
          if (image.occlusion !== undefined) {
            occluders.push({
              depth: anchor.y,
              line: image.occlusion.map(toPixel),
              bounds: { x, y, width: image.width, height: image.height },
            });
          }
        }
        // A portal is a tile object: its tile's trigger polygon is the trigger area (14.2).
        if (type === "portal" && image.trigger !== undefined) {
          portals.push({
            name: object.name ?? "",
            objectId: object.id,
            polygon: image.trigger.map(toPixel),
            targetMap: stringOf(propertyOf(object, "targetMap")),
            targetSpawn: stringOf(propertyOf(object, "targetSpawn")),
          });
        }
        if (type === "clickable") {
          clickables.push({
            ...clickableOf(object, rectangleToPolygon(x, y, image.width, image.height)),
            objectId: object.id,
          });
        }
        for (const shape of image.collision) solids.push(shape.map(toPixel));
        continue;
      }
      const polygon = polygonOf(object, toScreen);
      if (type === "spawn") {
        spawns.set(object.name ?? "", toScreen(object.x, object.y));
      } else if (type === "" && object.point === true && object.name !== undefined) {
        // An untyped point is the approach point of a clickable object (14.2).
        points.set(object.name, toScreen(object.x, object.y));
      } else if (type === "clickable" && polygon !== undefined) {
        clickables.push(clickableOf(object, polygon));
      } else if (type === "wander" && polygon !== undefined) {
        wanders.push(polygon);
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
    source: map,
    ground,
    objects,
    occluders,
    obstacles: { size, columns: map.width, rows: map.height, blockedCells, solids, borders },
    spawns,
    portals,
    wanders,
    clickables: clickables.map(({ approachName, ...clickable }) => ({
      ...clickable,
      approach:
        (approachName === undefined ? undefined : points.get(approachName)) ??
        belowOf(clickable.polygon, size),
    })),
    atmosphere: atmosphereOf(map),
    drawnLayers,
  };
}

/** The effects a map has: each is on unless the map property of the same name is `false` (GAME-34). */
function atmosphereOf(map: {
  properties?: { name: string; value: unknown }[] | undefined;
}): MapAtmosphere {
  const on = (name: string): boolean =>
    map.properties?.find((property) => property.name === name)?.value !== false;
  return { clouds: on("clouds"), birds: on("birds"), fog: on("fog") };
}

/** A clickable object before its approach point is resolved: the point has a name, which may come later. */
function clickableOf(
  object: TiledObject,
  polygon: Point[],
): Omit<ClickableArea, "approach"> & { approachName?: string } {
  const label = stringOf(propertyOf(object, "label"));
  const approachName = stringOf(propertyOf(object, "approach"));
  const preset = presetActionOf(object.properties);
  return {
    name: object.name ?? "",
    ...(label === undefined ? {} : { label }),
    hidden: propertyOf(object, "hidden") === true,
    polygon,
    ...(approachName === undefined ? {} : { approachName }),
    ...(preset === undefined ? {} : { preset }),
  };
}

/** The default approach point (14.2): below the object's bottom edge, half a tile height under its centre. */
function belowOf(polygon: readonly Point[], size: TileSize): Point {
  const xs = polygon.map((point) => point.x);
  const ys = polygon.map((point) => point.y);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: Math.max(...ys) + size.height / 2,
  };
}

/** The polygon of a rectangle or polygon object, in the map's pixel space. Undefined for other shapes. */
function polygonOf(
  object: TiledObject,
  toScreen: (x: number, y: number) => Point,
): Point[] | undefined {
  if (object.polygon !== undefined)
    return object.polygon.map((p) => toScreen(object.x + p.x, object.y + p.y));
  if (object.point === true || object.gid !== undefined) return undefined;
  if (object.width === undefined || object.height === undefined) return undefined;
  return rectangleToPolygon(object.x, object.y, object.width, object.height).map((p) =>
    toScreen(p.x, p.y),
  );
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
