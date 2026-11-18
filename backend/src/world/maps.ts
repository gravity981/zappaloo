// The rules of one Tiled map of the world package (sw-architecture.md 14.4, MAP-02, MAP-03, MAP-06, MAP-08):
// the format (isometric, finite), the ordered layers, the embedded tilesets with their images, the tile ids,
// the objects by type, shape and properties (including collision and portal trigger guides), and references
// inside the map and to the other maps of the package.
import {
  tiledMapSchema,
  WORLD_ACTIONS,
  WORLD_BUILTIN_PAGES,
  WORLD_ID_PATTERN,
  WORLD_LIMITS,
  WORLD_MAP_SWITCHES,
} from "@zappaloo/shared";
import type {
  TiledLayer,
  TiledMap,
  TiledObject,
  TiledTile,
  TiledTileLayer,
  TiledTileset,
} from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, warningFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";
import { flattenLayers } from "./layers.ts";

/** What the rules of a map need from the rest of the package. */
export interface MapContext {
  /** The tile width and height of `manifest.json`; undefined while the manifest is refused. */
  tileWidth: number | undefined;
  tileHeight: number | undefined;
  /** Every file of the package by its path. */
  files: Map<string, Buffer>;
  /** The size of every PNG of the package by its path. */
  images: Map<string, PngSize>;
  /** The format version of the package (14.4); 2 when it is not known. */
  formatVersion?: number;
}

/** A portal of a valid map, with its target; checked against the other maps by `checkMapReferences`. */
export interface PortalInfo {
  object: string;
  targetMap: string;
  targetSpawn: string;
}

/** What the other maps and the manifest need to know about a map. */
export interface MapInfo {
  id: string;
  /** The names of its spawn points. */
  spawns: Set<string>;
  portals: PortalInfo[];
  /** The names (without `.png`) of the tileset images the map uses, sheets and collection tiles. */
  tilesetImages: Set<string>;
}

export interface MapResult {
  /** Present when the map is readable as a Tiled map. */
  info?: MapInfo;
  findings: WorldFinding[];
}

/** The global tile ids of one tileset: a range, or the ids of a collection with gaps (absolute ids). */
interface TileRange {
  /** The tileset name, for the findings. */
  name: string;
  /** The names (without `.png`) of the images the tileset uses: one for a sheet, one per tile for a collection. */
  images: string[];
  first: number;
  last: number;
  /** The global ids of an image collection (sparse); undefined for a sheet, whose ids are a range. */
  ids?: Set<number>;
}

/** The shapes of a Tiled object. */
type Shape = "point" | "rectangle" | "polygon" | "polyline" | "tile";

/** The shapes each object type accepts (14.2, 14.4). An untyped object is a point. */
const SHAPES: Record<string, Shape[]> = {
  spawn: ["point"],
  portal: ["tile"],
  clickable: ["rectangle", "polygon", "tile"],
  decoration: ["rectangle", "polygon", "tile", "point"],
  seat: ["point"],
  wander: ["rectangle", "polygon"],
  border: ["polygon"],
  collision: ["rectangle", "polygon"],
  protected: ["rectangle"],
  "": ["point"],
};

/** The properties each type uses (14.2, 14.4); others are reported as unknown (warnings). */
const PROPERTIES: Record<string, string[]> = {
  spawn: [],
  // The label and the approach of a portal are not used (14.2): a portal with them is a warning, not a refusal.
  portal: ["targetMap", "targetSpawn"],
  clickable: ["label", "approach", "action", "page", "contentId", "minigameId", "hidden"],
  decoration: [],
  seat: ["table"],
  wander: [],
  border: [],
  collision: [],
  protected: [],
  "": [],
};

/** The property each action of a clickable object needs (14.2). */
const ACTION_PROPERTY: Record<string, "page" | "contentId" | "minigameId"> = {
  page: "page",
  content: "contentId",
  dialog: "contentId",
  minigame: "minigameId",
};

/** A content slug: lower-case letters, digits and single hyphens, as the content pages use. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The longest text of a label is 40 characters (14.2). */
const LABEL_LENGTH = 40;

/** The map property the camera zoom had in the prototype; the platform fixes the zoom at 2. */
const FIXED_ZOOM_PROPERTY = "cameraZoom";

/** The flip and rotation bits of a Tiled global tile id. */
const FLIP_MASK = 0xe0000000;
const TILE_ID_MASK = 0x1fffffff;

const ALLOWED_LAYER_TYPES = ["tilelayer", "objectgroup", "group"];

function mapFile(id: string): string {
  return `maps/${id}.json`;
}

/** The type of a Tiled object or layer: `type` (Tiled 1.10), otherwise `class` (Tiled 1.9). */
function typeOf(item: { type?: string; class?: string }): string {
  return item.type ?? item.class ?? "";
}

function shapeOf(object: TiledObject): Shape | "ellipse" | "text" {
  if (object.point === true) return "point";
  if (object.ellipse === true) return "ellipse";
  if (object.text !== undefined) return "text";
  if (object.polygon !== undefined) return "polygon";
  if (object.polyline !== undefined) return "polyline";
  if (object.gid !== undefined) return "tile";
  return "rectangle";
}

/** The properties of an object or map as a name → value table (Tiled's custom properties). */
function propertyTable(properties: { name: string; value: unknown }[] | undefined) {
  return new Map((properties ?? []).map((property) => [property.name, property.value]));
}

/** The number of tiles of a sheet image, from its size, margin and spacing; undefined if not whole. */
function tileCount(
  tileset: TiledTileset,
  image: PngSize,
  tileWidth: number,
  tileHeight: number,
): { columns: number; count: number } | undefined {
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const width = image.width - 2 * margin + spacing;
  const height = image.height - 2 * margin + spacing;
  const stepX = tileWidth + spacing;
  const stepY = tileHeight + spacing;
  if (width <= 0 || height <= 0 || width % stepX !== 0 || height % stepY !== 0) return undefined;
  const columns = width / stepX;
  return { columns, count: columns * (height / stepY) };
}

/**
 * Refused layers are reported and removed before the map is read: image layers, unknown layer types and
 * compressed tile layers. Group layers are kept and their layers checked the same way.
 */
function pruneLayers(layers: unknown[], file: string, findings: WorldFinding[]): unknown[] {
  const kept: unknown[] = [];
  for (const layer of layers) {
    if (typeof layer !== "object" || layer === null) {
      findings.push(errorFinding(file, "map_layer", "a layer is not an object"));
      continue;
    }
    const item = layer as {
      type?: unknown;
      name?: unknown;
      compression?: unknown;
      layers?: unknown;
    };
    const name = typeof item.name === "string" ? item.name : "(unnamed)";
    if (!ALLOWED_LAYER_TYPES.includes(String(item.type))) {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${name} is of type ${String(item.type)}; only tile, object and group layers are allowed`,
          name,
        ),
      );
      continue;
    }
    if (
      item.type === "tilelayer" &&
      typeof item.compression === "string" &&
      item.compression !== ""
    ) {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${name} is compressed; export the map without compression`,
          name,
        ),
      );
      continue;
    }
    if (item.type === "group" && Array.isArray(item.layers)) {
      kept.push({ ...item, layers: pruneLayers(item.layers, file, findings) });
      continue;
    }
    kept.push(layer);
  }
  return kept;
}

/** Every object of the map's object layers, and the tile objects inside them. */
function allObjects(layers: TiledLayer[]): TiledObject[] {
  return flattenLayers(layers).flatMap((layer) =>
    layer.type === "objectgroup" ? layer.objects : [],
  );
}

/** Refuses Tiled settings whose rendering or map behaviour the game does not reproduce. */
function checkRenderingSettings(
  layers: TiledLayer[],
  file: string,
  findings: WorldFinding[],
): void {
  for (const layer of layers) {
    const label = layer.name || "(unnamed)";
    const numericDefaults: [string, number | undefined, number][] = [
      ["x", layer.x, 0],
      ["y", layer.y, 0],
      ["offsetx", layer.offsetx, 0],
      ["offsety", layer.offsety, 0],
      ["opacity", layer.opacity, 1],
      ["parallaxx", layer.parallaxx, 1],
      ["parallaxy", layer.parallaxy, 1],
    ];
    for (const [key, value, expected] of numericDefaults) {
      if (value !== undefined && value !== expected) {
        findings.push(
          errorFinding(
            file,
            "map_layer",
            `layer ${label} has ${key}=${String(value)}; only ${String(expected)} is supported`,
            label,
          ),
        );
      }
    }
    if (layer.tintcolor !== undefined) {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${label} has tintcolor=${JSON.stringify(layer.tintcolor)}; tint is not supported`,
          label,
        ),
      );
    }
    if (layer.blendmode !== undefined && layer.blendmode !== "normal") {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${label} has blendmode=${JSON.stringify(layer.blendmode)}; only normal is supported`,
          label,
        ),
      );
    }
    if (layer.type === "tilelayer" && ((layer.repeatx ?? false) || (layer.repeaty ?? false))) {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${label} repeats tiles; repetition is not supported`,
          label,
        ),
      );
    }
    if (layer.type === "group") {
      if (layer.visible === false) {
        findings.push(
          errorFinding(
            file,
            "map_layer",
            `group ${label} is hidden; inherited group visibility is not supported`,
            label,
          ),
        );
      }
      checkRenderingSettings(layer.layers, file, findings);
    } else if (
      layer.type === "objectgroup" &&
      layer.draworder !== undefined &&
      layer.draworder !== "topdown"
    ) {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `object layer ${label} has draworder=${JSON.stringify(layer.draworder)}; only topdown is supported`,
          label,
        ),
      );
    }
  }
}

/** Checks one Tiled map of the package. */
export function checkMap(id: string, bytes: Buffer, context: MapContext): MapResult {
  const file = mapFile(id);
  const findings: WorldFinding[] = [];
  if (!WORLD_ID_PATTERN.test(id)) {
    findings.push(errorFinding(file, "map_id", "the map id is 1–40 characters of a–z, 0–9 and -"));
  }

  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push(errorFinding(file, "json_invalid", "not valid JSON"));
    return { findings };
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    findings.push(errorFinding(file, "map_format", "not a Tiled map object"));
    return { findings };
  }
  const document = raw as Record<string, unknown>;
  if (document.infinite === true) {
    findings.push(errorFinding(file, "map_format", "infinite maps are refused; the map is finite"));
  }
  if (document.orientation !== undefined && document.orientation !== "isometric") {
    findings.push(
      errorFinding(
        file,
        "map_format",
        `the orientation is ${JSON.stringify(document.orientation)}; the map must be isometric`,
      ),
    );
  }

  const layers = pruneLayers(Array.isArray(document.layers) ? document.layers : [], file, findings);
  const parsed = tiledMapSchema.safeParse({ ...document, layers });
  if (!parsed.success) {
    findings.push(errorFinding(file, "map_format", zodDetail(parsed.error)));
    return { findings };
  }
  const map: TiledMap = parsed.data;
  if (map.renderorder !== undefined && map.renderorder !== "right-down") {
    findings.push(
      errorFinding(
        file,
        "map_format",
        `renderorder is ${JSON.stringify(map.renderorder)}; only right-down is supported`,
      ),
    );
  }
  for (const [key, value] of [
    ["parallaxoriginx", map.parallaxoriginx],
    ["parallaxoriginy", map.parallaxoriginy],
  ] as const) {
    if (value !== undefined && value !== 0) {
      findings.push(
        errorFinding(
          file,
          "map_format",
          `${key} is ${String(value)}; only the default origin 0 is supported`,
        ),
      );
    }
  }
  checkRenderingSettings(map.layers, file, findings);
  if (
    context.tileWidth !== undefined &&
    context.tileHeight !== undefined &&
    (map.tilewidth !== context.tileWidth || map.tileheight !== context.tileHeight)
  ) {
    findings.push(
      errorFinding(
        file,
        "map_format",
        `the tiles are ${String(map.tilewidth)} × ${String(map.tileheight)} pixels; the package's tile size is ${String(context.tileWidth)} × ${String(context.tileHeight)}`,
      ),
    );
  }

  const ranges = checkTilesets(map, file, context, findings);
  const tilesetImages = new Set<string>(ranges.flatMap((range) => range.images));
  // Collection-tile guides add collision, portal trigger areas and actor-relative occlusion edges.
  const tileGuides = new Map<number, TileGuides>();
  for (const tileset of map.tilesets) {
    for (const tile of tileset.tiles ?? []) {
      // A sheet's tiles carry only properties, class, probability and animation (14.2): those are ignored.
      // Guides are read from image-collection tiles only, so a guide on a sheet tile is refused.
      if (tileset.image !== undefined) {
        if ((tile.objectgroup?.objects ?? []).length > 0) {
          findings.push(
            errorFinding(
              file,
              "map_guide",
              "guides on a tile of a sheet tileset are not supported; put the tile in an image-collection tileset",
              `${tileset.name} tile ${String(tile.id)}`,
            ),
          );
        }
        continue;
      }
      if (tile.animation !== undefined && tile.animation.length > 0) {
        findings.push(
          errorFinding(
            file,
            "map_tileset",
            `tileset ${tileset.name} tile ${String(tile.id)} is animated; tile animation is not supported`,
            tileset.name,
          ),
        );
      }
      tileGuides.set(tileset.firstgid + tile.id, checkTileGuides(tile, tileset, file, findings));
    }
  }

  const flat = flattenLayers(map.layers);
  let collision = false;
  let tileLayers = 0;
  for (const layer of flat) {
    if (layer.name === "") {
      findings.push(errorFinding(file, "map_layer", "a layer has no name"));
    }
    if (layer.type === "tilelayer") {
      const hasTiles = checkTileLayer(layer, map, ranges, file, findings);
      if (layer.name === "collision") collision ||= hasTiles;
      else tileLayers += 1;
    }
  }
  if (tileLayers === 0) {
    findings.push(errorFinding(file, "map_layer", "the map needs a tile layer besides collision"));
  }

  // Objects: the spawn points, the portals, the approach points, the collision shapes, the tiles placed.
  const objects = checkObjects(map, file, ranges, tileGuides, context, findings);
  if (objects.collision || objects.placedBlocking) collision = true;
  if (!objects.spawns.has("start")) {
    findings.push(errorFinding(file, "map_reference", "the map has no spawn point named start"));
  }
  for (const [name, approach] of objects.approaches) {
    if (!objects.points.has(approach)) {
      findings.push(
        errorFinding(
          file,
          "map_reference",
          `approach ${approach} names no point object without a type`,
          name,
        ),
      );
    }
  }

  // Map properties: `name` is the name the admin area shows; the camera zoom is fixed at 2 and read
  // from nowhere; other properties are not used by the platform and are reported.
  const mapProperties = propertyTable(map.properties);
  const switches: readonly string[] = (context.formatVersion ?? 2) >= 3 ? WORLD_MAP_SWITCHES : [];
  for (const key of mapProperties.keys()) {
    if (key === "name") continue;
    // The switches of format version 3 are properties of the platform: an effect is on unless it is `false`.
    if (switches.includes(key)) {
      if (typeof mapProperties.get(key) !== "boolean") {
        findings.push(
          errorFinding(file, "map_property", `the map property ${key} must be true or false`),
        );
      }
      continue;
    }
    const detail =
      key === FIXED_ZOOM_PROPERTY
        ? "the camera zoom is fixed at 2 and is not read from the map"
        : `map property ${key} is not used by the platform`;
    findings.push(warningFinding(file, "property_unknown", detail));
  }
  const name = mapProperties.get("name");
  if (
    name !== undefined &&
    (typeof name !== "string" || name.length < 1 || name.length > WORLD_LIMITS.nameLength)
  ) {
    findings.push(errorFinding(file, "map_property", "the map name is not 1–60 characters"));
  }
  if (!collision) {
    findings.push(
      warningFinding(
        file,
        "map_collision",
        "the map has no collision tiles, collision shapes, borders or collision guides; guests walk through everything",
      ),
    );
  }

  return {
    info: { id, spawns: objects.spawns, portals: objects.portals, tilesetImages },
    findings,
  };
}

/**
 * The tilesets of a map: embedded, sheets with one image, image collections with one image per tile. The
 * images are PNGs in `tilesets/`, whole tiles of the world's tile size. Returns the tile ids of each.
 */
function checkTilesets(
  map: TiledMap,
  file: string,
  context: MapContext,
  findings: WorldFinding[],
): TileRange[] {
  const ranges: TileRange[] = [];
  for (const tileset of map.tilesets) {
    const name = tileset.name;
    const nextFirstGid = map.tilesets.reduce(
      (next, candidate) =>
        candidate.firstgid > tileset.firstgid ? Math.min(next, candidate.firstgid) : next,
      Number.POSITIVE_INFINITY,
    );
    const hasTileObjects = flattenLayers(map.layers).some(
      (layer) =>
        layer.type === "objectgroup" &&
        layer.objects.some((object) => {
          if (object.gid === undefined) return false;
          const gid = object.gid & TILE_ID_MASK;
          return gid >= tileset.firstgid && gid < nextFirstGid;
        }),
    );
    const effectiveAlignment = tileset.objectalignment ?? "bottom";
    if (
      tileset.tileoffset !== undefined &&
      (tileset.tileoffset.x !== 0 || tileset.tileoffset.y !== 0)
    ) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `tileset ${name} has a non-zero tile offset; tileoffset must be (0, 0)`,
          name,
        ),
      );
    }
    if (hasTileObjects && effectiveAlignment !== "bottom") {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `tileset ${name} uses objectalignment=${JSON.stringify(effectiveAlignment)}; tile objects must use bottom alignment`,
          name,
        ),
      );
    }
    if (tileset.source !== undefined) {
      findings.push(
        errorFinding(file, "map_tileset", "an external tileset; embed it in the map", name),
      );
      continue;
    }
    // A tileset without an image but with tiles is an image collection; with an image it is a sheet.
    if (tileset.image === undefined && tileset.tiles !== undefined) {
      const range = checkCollection(tileset, file, context, findings);
      if (range !== undefined) ranges.push(range);
      continue;
    }
    if (tileset.image === undefined) {
      findings.push(
        errorFinding(file, "map_tileset", "a tileset has neither an image nor tiles", name),
      );
      continue;
    }
    const imageName = imageNameOf(tileset.image);
    if (imageName === undefined) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `the image ${tileset.image} must be ../tilesets/<name>.png`,
          name,
        ),
      );
      continue;
    }
    if (!sizeMatches(tileset, context, file, findings)) continue;
    const imagePath = `tilesets/${imageName}.png`;
    if (!context.files.has(imagePath)) {
      findings.push(errorFinding(file, "map_tileset", `the image ${imagePath} is missing`, name));
      continue;
    }
    const size = context.images.get(imagePath);
    if (size === undefined) continue; // not a PNG: reported for the file itself
    const count = tileCount(tileset, size, tileset.tilewidth, tileset.tileheight);
    if (count === undefined) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `the image is ${String(size.width)} × ${String(size.height)} pixels, not a whole number of tiles`,
          name,
        ),
      );
      continue;
    }
    ranges.push({
      name: tileset.name,
      images: [imageName],
      first: tileset.firstgid,
      last: tileset.firstgid + count.count - 1,
    });
  }
  ranges.sort((a, b) => a.first - b.first);
  for (let i = 1; i < ranges.length; i++) {
    const previous = ranges[i - 1];
    const current = ranges[i];
    if (previous && current && current.first <= previous.last) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `the tile ids of ${current.name} overlap ${previous.name}`,
        ),
      );
    }
  }
  return ranges;
}

/** The name of an image in `tilesets/` from the path a map gives it (`../tilesets/<name>.png`). */
function imageNameOf(image: string): string | undefined {
  const match = /^\.\.\/tilesets\/([A-Za-z0-9][A-Za-z0-9._-]{0,80})\.png$/.exec(image);
  return match?.[1];
}

/** The unscaled size of a tile object, from its tileset cell or collection image. */
function tileObjectSize(map: TiledMap, gid: number, context: MapContext): PngSize | undefined {
  let selected: TiledTileset | undefined;
  for (const tileset of map.tilesets) {
    if (
      tileset.firstgid <= gid &&
      (selected === undefined || tileset.firstgid > selected.firstgid)
    ) {
      selected = tileset;
    }
  }
  if (selected === undefined) return undefined;
  if (selected.image !== undefined || selected.tiles === undefined) {
    return { width: selected.tilewidth, height: selected.tileheight };
  }
  const tile = selected.tiles.find((candidate) => selected.firstgid + candidate.id === gid);
  const imageName = tile?.image === undefined ? undefined : imageNameOf(tile.image);
  return imageName === undefined ? undefined : context.images.get(`tilesets/${imageName}.png`);
}

/** A sheet's tile size is the world's; without a tile size of the package, nothing is compared. */
function sizeMatches(
  tileset: TiledTileset,
  context: MapContext,
  file: string,
  findings: WorldFinding[],
): boolean {
  if (
    (context.tileWidth !== undefined && tileset.tilewidth !== context.tileWidth) ||
    (context.tileHeight !== undefined && tileset.tileheight !== context.tileHeight)
  ) {
    findings.push(
      errorFinding(
        file,
        "map_tileset",
        "the tiles are not of the package's tile size",
        tileset.name,
      ),
    );
    return false;
  }
  return true;
}

/** An image-collection tileset: one PNG per tile, their ids may have gaps. */
function checkCollection(
  tileset: TiledTileset,
  file: string,
  context: MapContext,
  findings: WorldFinding[],
): TileRange | undefined {
  const name = tileset.name;
  const ids = new Set<number>();
  const images: string[] = [];
  for (const tile of tileset.tiles ?? []) {
    const image = tile.image;
    const imageName = image === undefined ? undefined : imageNameOf(image);
    if (imageName === undefined) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `tile ${String(tile.id)} has the image ${String(image)}; it must be ../tilesets/<name>.png`,
          name,
        ),
      );
      continue;
    }
    const imagePath = `tilesets/${imageName}.png`;
    if (!context.files.has(imagePath)) {
      findings.push(errorFinding(file, "map_tileset", `the image ${imagePath} is missing`, name));
      continue;
    }
    images.push(imageName);
    ids.add(tileset.firstgid + tile.id);
    // The declared size is required: the engine would otherwise fall back to the tileset's tile size.
    if (tile.imagewidth === undefined || tile.imageheight === undefined) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `tile ${String(tile.id)} of the collection has no imagewidth and imageheight`,
          name,
        ),
      );
    }
    const size = context.images.get(imagePath);
    if (size === undefined) continue; // not a PNG: reported for the file itself
    if (
      (tile.imagewidth !== undefined && tile.imagewidth !== size.width) ||
      (tile.imageheight !== undefined && tile.imageheight !== size.height)
    ) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          `the size of ${imagePath} does not match the tileset`,
          name,
        ),
      );
    }
  }
  if (ids.size === 0) return undefined;
  const sorted = [...ids].sort((a, b) => a - b);
  return {
    name,
    images,
    first: sorted[0] ?? tileset.firstgid,
    last: sorted[sorted.length - 1] ?? tileset.firstgid,
    ids,
  };
}

/** Whether a collection tile blocks movement or has a portal activation area. */
interface TileGuides {
  /** A `collision` guide: a placed tile blocks. */
  blocks: boolean;
  /** A `trigger` guide: the tile is a portal, and the polygon is its trigger area. */
  trigger: boolean;
}

function checkTileGuides(
  tile: TiledTile,
  tileset: TiledTileset,
  file: string,
  findings: WorldFinding[],
): TileGuides {
  let blocks = false;
  let trigger = false;
  let occlusion = false;
  const label = `${tileset.name} tile ${String(tile.id)}`;
  for (const guide of tile.objectgroup?.objects ?? []) {
    const shape = shapeOf(guide);
    if (guide.visible === false) {
      findings.push(
        errorFinding(
          file,
          "map_guide",
          `${label} has an individually hidden guide; hidden guides are not supported`,
          label,
        ),
      );
    }
    if (guide.name === "collision" && (shape === "polygon" || shape === "rectangle")) {
      blocks = true;
    } else if (guide.name === "trigger" && (shape === "polygon" || shape === "rectangle")) {
      if (trigger) {
        findings.push(
          errorFinding(file, "map_guide", "a tile has more than one trigger area", label),
        );
      }
      trigger = true;
    } else if (
      guide.name === "occlusion" &&
      shape === "polyline" &&
      (guide.polyline?.length ?? 0) >= 2
    ) {
      if (occlusion) {
        findings.push(
          errorFinding(file, "map_guide", "a tile has more than one occlusion line", label),
        );
      }
      occlusion = true;
    } else {
      findings.push(
        errorFinding(
          file,
          "map_guide",
          "a tile guide is a polygon or rectangle named collision or trigger, or a polyline named occlusion",
          label,
        ),
      );
    }
  }
  return { blocks, trigger };
}

/** Whether a global tile id belongs to one of the tilesets of the map. */
function inRanges(gid: number, ranges: TileRange[]): boolean {
  return ranges.some((range) =>
    range.ids !== undefined ? range.ids.has(gid) : gid >= range.first && gid <= range.last,
  );
}

/** Checks the tile data of a layer; returns whether it places any tile. */
function checkTileLayer(
  layer: TiledTileLayer,
  map: TiledMap,
  ranges: TileRange[],
  file: string,
  findings: WorldFinding[],
): boolean {
  const name = layer.name;
  if (layer.width !== map.width || layer.height !== map.height) {
    findings.push(errorFinding(file, "map_layer", "the layer is not the size of the map", name));
  }
  let values: number[] = [];
  if (Array.isArray(layer.data)) {
    if (layer.encoding === "base64") {
      findings.push(errorFinding(file, "map_layer", "the data is not Base64 text", name));
    }
    values = layer.data;
  } else {
    const bytes = Buffer.from(layer.data, "base64");
    if (layer.encoding !== "base64") {
      findings.push(errorFinding(file, "map_layer", "text data must be Base64", name));
    } else if (bytes.length % 4 !== 0) {
      findings.push(errorFinding(file, "map_layer", "the Base64 data is not whole tile ids", name));
    }
    for (let offset = 0; offset + 4 <= bytes.length; offset += 4) {
      values.push(bytes.readUInt32LE(offset));
    }
  }
  if (values.length !== layer.width * layer.height) {
    findings.push(
      errorFinding(
        file,
        "map_layer",
        `the layer holds ${String(values.length)} tiles instead of ${String(layer.width * layer.height)}`,
        name,
      ),
    );
  }
  let placed = false;
  let unknownReported = false;
  let transformReported = false;
  for (const value of values) {
    if ((value & FLIP_MASK) !== 0) {
      if (!transformReported) {
        findings.push(
          errorFinding(
            file,
            "map_layer",
            `layer ${name} contains a flipped or rotated tile; tile transforms are refused`,
            name,
          ),
        );
        transformReported = true;
      }
      continue;
    }
    const gid = value & TILE_ID_MASK;
    if (gid === 0) continue;
    placed = true;
    if (!unknownReported && !inRanges(gid, ranges)) {
      findings.push(
        errorFinding(file, "map_tiles", `the tile id ${String(gid)} is in no tileset`, name),
      );
      unknownReported = true;
    }
  }
  return placed;
}

interface ObjectsResult {
  spawns: Set<string>;
  portals: PortalInfo[];
  /** The names of the point objects without a type, which approach points can name. */
  points: Set<string>;
  /** Approach references: object name → the point it names. */
  approaches: [string, string][];
  /** Whether a collision rectangle, polygon or border is on the map. */
  collision: boolean;
  /** Whether a tile with a collision guide is placed on the map. */
  placedBlocking: boolean;
}

/** Checks the objects of all object layers of a map. */
function checkObjects(
  map: TiledMap,
  file: string,
  ranges: TileRange[],
  tileGuides: Map<number, TileGuides>,
  context: MapContext,
  findings: WorldFinding[],
): ObjectsResult {
  const result: ObjectsResult = {
    spawns: new Set(),
    portals: [],
    points: new Set(),
    approaches: [],
    collision: false,
    placedBlocking: false,
  };
  const objects = allObjects(map.layers);
  const typedNames = new Set<string>();
  for (const object of objects) {
    checkObject(object, file, ranges, map, context, findings, result, typedNames, tileGuides);
  }
  return result;
}

function checkObject(
  object: TiledObject,
  file: string,
  ranges: TileRange[],
  map: TiledMap,
  context: MapContext,
  findings: WorldFinding[],
  result: ObjectsResult,
  typedNames: Set<string>,
  tileGuides: Map<number, TileGuides>,
): void {
  const type = typeOf(object);
  const name = object.name ?? "";
  const label = name === "" ? `object ${String(object.id)}` : name;
  const shape = shapeOf(object);
  if (object.visible === false) {
    findings.push(
      errorFinding(
        file,
        "map_object",
        `${label} is individually hidden; hidden objects are not supported`,
        label,
      ),
    );
  }
  if (shape === "ellipse" || shape === "text") {
    findings.push(errorFinding(file, "map_object", `a ${shape} is not allowed`, label));
    return;
  }
  if (object.rotation !== undefined && object.rotation !== 0) {
    findings.push(errorFinding(file, "map_object", "a rotated object is refused", label));
    return;
  }
  if (object.gid !== undefined) {
    if ((object.gid & FLIP_MASK) !== 0) {
      findings.push(errorFinding(file, "map_object", "a flipped tile object is refused", label));
      return;
    }
    const gid = object.gid & TILE_ID_MASK;
    if (!inRanges(gid, ranges)) {
      findings.push(
        errorFinding(file, "map_tiles", `the tile id ${String(gid)} is in no tileset`, label),
      );
      return;
    }
    const naturalSize = tileObjectSize(map, gid, context);
    if (
      naturalSize !== undefined &&
      ((object.width !== undefined && object.width !== naturalSize.width) ||
        (object.height !== undefined && object.height !== naturalSize.height))
    ) {
      findings.push(
        errorFinding(
          file,
          "map_object",
          `${label} is scaled; tile objects must be ${String(naturalSize.width)} × ${String(naturalSize.height)} pixels`,
          label,
        ),
      );
    }
    if (tileGuides.get(gid)?.blocks === true) result.placedBlocking = true;
  }

  if (type === "") {
    // An untyped object is a point: the approach point of a clickable object.
    if (shape !== "point") {
      findings.push(
        errorFinding(file, "map_object", "an object without a type must be a point", label),
      );
      return;
    }
    if (name !== "") result.points.add(name);
    return;
  }
  // Format version 3 does not read the type `seat` any more: the seating plan lives in the platform (14.4).
  if (!(type in SHAPES) || (type === "seat" && (context.formatVersion ?? 2) >= 3)) {
    findings.push(errorFinding(file, "map_object", `the type ${type} is not allowed`, label));
    return;
  }
  if (!(SHAPES[type] ?? []).includes(shape)) {
    findings.push(errorFinding(file, "map_object", `a ${type} cannot be a ${shape}`, label));
    return;
  }

  const properties = propertyTable(object.properties);
  for (const key of properties.keys()) {
    if (!(PROPERTIES[type] ?? []).includes(key)) {
      findings.push(
        warningFinding(file, "property_unknown", `property ${key} is not used by a ${type}`, label),
      );
    }
  }

  if (type === "spawn" || type === "portal" || type === "clickable") {
    if (!WORLD_ID_PATTERN.test(name)) {
      findings.push(
        errorFinding(
          file,
          "map_object",
          "the name is missing or not 1–40 characters of a–z, 0–9 and -",
          label,
        ),
      );
    } else if (typedNames.has(name)) {
      findings.push(
        errorFinding(
          file,
          "map_object",
          "the name is used by another spawn, portal or clickable object",
          label,
        ),
      );
    }
    typedNames.add(name);
  }

  const approach = stringProperty(properties.get("approach"));
  if (approach !== undefined) {
    if (WORLD_ID_PATTERN.test(approach)) result.approaches.push([label, approach]);
    else findings.push(errorFinding(file, "map_property", "approach is not a point name", label));
  } else if (properties.has("approach")) {
    findings.push(errorFinding(file, "map_property", "approach is not a point name", label));
  }

  if (type === "spawn") {
    result.spawns.add(name);
  } else if (type === "portal") {
    checkPortal(object, label, file, findings, result, properties, tileGuides);
  } else if (type === "clickable") {
    checkClickable(label, file, findings, properties);
  } else if (type === "seat") {
    const table = properties.get("table");
    const value = typeof table === "number" ? String(table) : stringProperty(table);
    if (value === undefined || value.length < 1 || value.length > 40) {
      findings.push(
        errorFinding(file, "map_property", "table is missing or not 1–40 characters", label),
      );
    }
  } else if (type === "collision" || type === "border") {
    result.collision = true;
  }
}

function checkPortal(
  object: TiledObject,
  label: string,
  file: string,
  findings: WorldFinding[],
  result: ObjectsResult,
  properties: Map<string, unknown>,
  tileGuides: Map<number, TileGuides>,
): void {
  const targetMap = stringProperty(properties.get("targetMap"));
  const targetSpawn = stringProperty(properties.get("targetSpawn"));
  const hasTarget = properties.has("targetMap") || properties.has("targetSpawn");
  if (!hasTarget) {
    findings.push(
      warningFinding(
        file,
        "portal_no_target",
        "the portal has no target and does nothing yet",
        label,
      ),
    );
  } else {
    if (targetMap === undefined || !WORLD_ID_PATTERN.test(targetMap)) {
      findings.push(
        errorFinding(file, "map_property", "targetMap is missing or not a map id", label),
      );
    }
    if (targetSpawn === undefined || !WORLD_ID_PATTERN.test(targetSpawn)) {
      findings.push(
        errorFinding(file, "map_property", "targetSpawn is missing or not a spawn name", label),
      );
    }
  }
  // The arrow is the tile itself; its trigger area is the tile's trigger guide (14.2).
  const trigger =
    object.gid !== undefined && tileGuides.get(object.gid & TILE_ID_MASK)?.trigger === true;
  if (!trigger) {
    findings.push(
      errorFinding(
        file,
        "map_object",
        "a portal's tile needs a trigger polygon named trigger",
        label,
      ),
    );
  }
  checkLabel(properties, label, file, findings);
  if (
    targetMap !== undefined &&
    targetSpawn !== undefined &&
    WORLD_ID_PATTERN.test(targetMap) &&
    WORLD_ID_PATTERN.test(targetSpawn) &&
    object.name !== undefined
  ) {
    result.portals.push({ object: label, targetMap, targetSpawn });
  }
}

function checkClickable(
  label: string,
  file: string,
  findings: WorldFinding[],
  properties: Map<string, unknown>,
): void {
  checkLabel(properties, label, file, findings);
  if (properties.has("hidden") && typeof properties.get("hidden") !== "boolean") {
    findings.push(errorFinding(file, "map_property", "hidden is not true or false", label));
  }
  const action = properties.get("action");
  // The property of the action, if any; the other action properties are reported as unknown.
  let used: string | undefined;
  if (action !== undefined) {
    const value = stringProperty(action);
    if (value === undefined || !(WORLD_ACTIONS as readonly string[]).includes(value)) {
      findings.push(
        errorFinding(
          file,
          "map_property",
          "action is not page, content, dialog or minigame",
          label,
        ),
      );
    } else {
      used = ACTION_PROPERTY[value];
      checkActionProperty(value, properties, file, findings, label);
    }
  }
  for (const key of ["page", "contentId", "minigameId"] as const) {
    if (properties.has(key) && key !== used) {
      findings.push(
        warningFinding(
          file,
          "property_unknown",
          action === undefined
            ? `property ${key} is used only with an action`
            : `property ${key} is not used by the action ${stringProperty(action) ?? ""}`,
          label,
        ),
      );
    }
  }
}

function checkActionProperty(
  action: string,
  properties: Map<string, unknown>,
  file: string,
  findings: WorldFinding[],
  label: string,
): void {
  if (action === "page") {
    const page = stringProperty(properties.get("page"));
    const builtin = page !== undefined && (WORLD_BUILTIN_PAGES as readonly string[]).includes(page);
    const contentPage =
      page !== undefined &&
      page.startsWith("p/") &&
      SLUG_PATTERN.test(page.slice(2)) &&
      page.length - 2 <= WORLD_LIMITS.propertyLength;
    if (!builtin && !contentPage) {
      findings.push(
        errorFinding(
          file,
          "map_property",
          "page is missing or not programme, rsvp, profile or p/<slug>",
          label,
        ),
      );
    }
    return;
  }
  const property = ACTION_PROPERTY[action] ?? "contentId";
  const value = stringProperty(properties.get(property));
  if (
    value === undefined ||
    !SLUG_PATTERN.test(value) ||
    value.length > WORLD_LIMITS.propertyLength
  ) {
    findings.push(
      errorFinding(file, "map_property", `action ${action} needs ${property}, a slug`, label),
    );
  }
}

function checkLabel(
  properties: Map<string, unknown>,
  label: string,
  file: string,
  findings: WorldFinding[],
): void {
  const value = properties.get("label");
  if (value === undefined) return;
  const text = stringProperty(value);
  if (text === undefined || text.length < 1 || text.length > LABEL_LENGTH) {
    findings.push(errorFinding(file, "map_property", "label is not 1–40 characters", label));
  }
}

/** A string property value, or undefined when it is not a string. */
function stringProperty(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * The references between the maps of the package (MAP-08): every portal with a target names a map of the
 * package and a spawn point of that map; the start map is one of the maps. `mapIds` holds every map of the
 * package, also those that could not be read, so a broken map is not reported as missing; the spawn
 * points of an unreadable map are not known and are not checked.
 */
export function checkMapReferences(
  maps: MapInfo[],
  startMap: string | undefined,
  mapIds: string[],
): WorldFinding[] {
  const findings: WorldFinding[] = [];
  const byId = new Map(maps.map((map) => [map.id, map]));
  if (startMap !== undefined && !mapIds.includes(startMap)) {
    findings.push(
      errorFinding(
        "manifest.json",
        "map_reference",
        `the start map ${startMap} is not in the package`,
      ),
    );
  }
  for (const map of maps) {
    for (const portal of map.portals) {
      const target = byId.get(portal.targetMap);
      if (!mapIds.includes(portal.targetMap)) {
        findings.push(
          errorFinding(
            mapFile(map.id),
            "map_reference",
            `the target map ${portal.targetMap} is not in the package`,
            portal.object,
          ),
        );
      } else if (target !== undefined && !target.spawns.has(portal.targetSpawn)) {
        findings.push(
          errorFinding(
            mapFile(map.id),
            "map_reference",
            `${portal.targetMap} has no spawn point ${portal.targetSpawn}`,
            portal.object,
          ),
        );
      }
    }
  }
  return findings;
}
