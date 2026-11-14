// The rules of one Tiled map of the world package (sw-architecture.md 14.4, MAP-06, MAP-08): the format,
// the layers, the embedded tilesets and their images, the tile ids, the objects by type, shape and
// properties, and the references inside the map and to the other maps of the package.
import {
  tiledMapSchema,
  WORLD_ACTIONS,
  WORLD_BUILTIN_PAGES,
  WORLD_ID_PATTERN,
  WORLD_LIMITS,
} from "@zappaloo/shared";
import type { TiledMap, TiledObject, TiledTileLayer, TiledTileset } from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, warningFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

/** What the rules of a map need from the rest of the package. */
export interface MapContext {
  /** The tile size of `manifest.json`; undefined while the manifest is refused. */
  tileSize: number | undefined;
  /** Every file of the package by its path. */
  files: Map<string, Buffer>;
  /** The size of every PNG of the package by its path. */
  images: Map<string, PngSize>;
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
  /** The names (without `.png`) of the tileset images the map uses. */
  tilesetImages: Set<string>;
}

export interface MapResult {
  /** Present when the map is readable as a Tiled map. */
  info?: MapInfo;
  findings: WorldFinding[];
}

/** A global tile id range of one tileset. */
interface TileRange {
  name: string;
  first: number;
  last: number;
}

/** The three shapes the platform accepts for an object of a map. */
type Shape = "point" | "rectangle" | "polygon" | "tile";

/** The shapes each object type accepts (14.4). An untyped object is a point. */
const SHAPES: Record<string, Shape[]> = {
  spawn: ["point"],
  portal: ["rectangle", "tile"],
  clickable: ["rectangle", "tile"],
  decoration: ["rectangle", "tile", "point", "polygon"],
  seat: ["point"],
  wander: ["rectangle", "polygon"],
  collision: ["rectangle"],
  protected: ["rectangle"],
  "": ["point"],
};

/** The properties each type uses (14.4); others are reported as unknown (warnings). */
const PROPERTIES: Record<string, string[]> = {
  spawn: [],
  portal: ["targetMap", "targetSpawn", "label", "approach"],
  clickable: ["label", "approach", "action", "page", "contentId", "minigameId", "hidden"],
  decoration: [],
  seat: ["table"],
  wander: [],
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

/** The longest text of a label is 40 characters (14.4). */
const LABEL_LENGTH = 40;

const TILE_ID_MASK = 0x1fffffff;

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
  if (object.gid !== undefined) return "tile";
  return "rectangle";
}

/** The properties of an object or map as a name → value table (Tiled's custom properties). */
function propertyTable(properties: { name: string; value: unknown }[] | undefined) {
  return new Map((properties ?? []).map((property) => [property.name, property.value]));
}

/** The number of tiles of a tileset image, from its size, margin and spacing; undefined if not whole. */
function tileCount(
  tileset: TiledTileset,
  image: PngSize,
): { columns: number; count: number } | undefined {
  const margin = tileset.margin ?? 0;
  const spacing = tileset.spacing ?? 0;
  const width = image.width - 2 * margin + spacing;
  const height = image.height - 2 * margin + spacing;
  const stepX = tileset.tilewidth + spacing;
  const stepY = tileset.tileheight + spacing;
  if (width <= 0 || height <= 0 || width % stepX !== 0 || height % stepY !== 0) return undefined;
  const columns = width / stepX;
  return { columns, count: columns * (height / stepY) };
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

  // Layers of other kinds (groups, images) are refused before the rest is read; the layer name
  // says which one.
  const layers: unknown[] = [];
  for (const layer of Array.isArray(document.layers) ? document.layers : []) {
    const item = layer as { type?: unknown; name?: unknown; compression?: unknown };
    const name = typeof item.name === "string" ? item.name : "(unnamed)";
    if (item.type !== "tilelayer" && item.type !== "objectgroup") {
      findings.push(
        errorFinding(
          file,
          "map_layer",
          `layer ${name} is of type ${String(item.type)}; only tile and object layers are allowed`,
          name,
        ),
      );
      continue;
    }
    if (typeof item.compression === "string" && item.compression !== "") {
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
    layers.push(layer);
  }

  const parsed = tiledMapSchema.safeParse({ ...document, layers });
  if (!parsed.success) {
    findings.push(errorFinding(file, "map_format", zodDetail(parsed.error)));
    return { findings };
  }
  const map: TiledMap = parsed.data;
  const tileSize = context.tileSize;
  if (tileSize !== undefined && (map.tilewidth !== tileSize || map.tileheight !== tileSize)) {
    findings.push(
      errorFinding(
        file,
        "map_format",
        `the tiles are ${String(map.tilewidth)} × ${String(map.tileheight)} pixels; the package's tile size is ${String(tileSize)}`,
      ),
    );
  }

  const ranges = checkTilesets(map, file, context, findings);
  const tilesetImages = new Set<string>();
  for (const range of ranges) tilesetImages.add(range.name);

  // Layer names, tile data and the collision layer.
  let collision = false;
  let tileLayers = 0;
  for (const layer of map.layers) {
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

  // Objects: the spawn points, the portals, the approach points, the collision rectangles.
  const objects = checkObjects(map, file, findings);
  if (objects.collision) collision = true;
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
  for (const key of (map.properties ?? []).map((property) => property.name)) {
    findings.push(
      warningFinding(file, "property_unknown", `map property ${key} is not used by the platform`),
    );
  }
  if (!collision) {
    findings.push(
      warningFinding(
        file,
        "map_collision",
        "the map has no collision tiles or rectangles; guests walk through everything",
      ),
    );
  }

  return {
    info: { id, spawns: objects.spawns, portals: objects.portals, tilesetImages },
    findings,
  };
}

/** The tilesets of a map: embedded, one image each in `tilesets/`, whole tiles. Returns their tile ids. */
function checkTilesets(
  map: TiledMap,
  file: string,
  context: MapContext,
  findings: WorldFinding[],
): TileRange[] {
  const ranges: TileRange[] = [];
  for (const tileset of map.tilesets) {
    const name = tileset.name;
    if (tileset.source !== undefined) {
      findings.push(
        errorFinding(file, "map_tileset", "an external tileset; embed it in the map", name),
      );
      continue;
    }
    if (tileset.image === undefined) {
      findings.push(
        errorFinding(
          file,
          "map_tileset",
          "a collection of images; use one image per tileset",
          name,
        ),
      );
      continue;
    }
    const match = /^\.\.\/tilesets\/([A-Za-z0-9][A-Za-z0-9._-]{0,80})\.png$/.exec(tileset.image);
    if (match?.[1] === undefined) {
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
    const imageName = match[1];
    const imagePath = `tilesets/${imageName}.png`;
    if (tileset.tilewidth !== context.tileSize && context.tileSize !== undefined) {
      findings.push(
        errorFinding(file, "map_tileset", "the tiles are not of the package's tile size", name),
      );
    }
    if (!context.files.has(imagePath)) {
      findings.push(errorFinding(file, "map_tileset", `the image ${imagePath} is missing`, name));
      continue;
    }
    const size = context.images.get(imagePath);
    if (size === undefined) continue; // not a PNG: reported for the file itself
    const count = tileCount(tileset, size);
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
      name: imageName,
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
  for (const value of values) {
    const gid = value & TILE_ID_MASK;
    if (gid === 0) continue;
    placed = true;
    if (!unknownReported && !ranges.some((range) => gid >= range.first && gid <= range.last)) {
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
  collision: boolean;
}

/** Checks the objects of all object layers of a map. */
function checkObjects(map: TiledMap, file: string, findings: WorldFinding[]): ObjectsResult {
  const result: ObjectsResult = {
    spawns: new Set(),
    portals: [],
    points: new Set(),
    approaches: [],
    collision: false,
  };
  const typedNames = new Set<string>();
  for (const layer of map.layers) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects) {
      checkObject(object, file, findings, result, typedNames);
    }
  }
  return result;
}

function checkObject(
  object: TiledObject,
  file: string,
  findings: WorldFinding[],
  result: ObjectsResult,
  typedNames: Set<string>,
): void {
  const type = typeOf(object);
  const name = object.name ?? "";
  const label = name === "" ? `object ${String(object.id)}` : name;
  const shape = shapeOf(object);
  if (shape === "ellipse" || shape === "text") {
    findings.push(errorFinding(file, "map_object", `a ${shape} is not allowed`, label));
    return;
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
  if (!(type in SHAPES)) {
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
    checkPortal(object, label, file, findings, result, properties);
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
  } else if (type === "collision") {
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
): void {
  const targetMap = stringProperty(properties.get("targetMap"));
  const targetSpawn = stringProperty(properties.get("targetSpawn"));
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
  checkLabel(properties, label, file, findings);
  if (targetMap !== undefined && targetSpawn !== undefined && object.name !== undefined) {
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
 * The references between the maps of the package (MAP-08): every portal names a map of the package
 * and a spawn point of that map; the start map is one of the maps. `mapIds` holds every map of the
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
