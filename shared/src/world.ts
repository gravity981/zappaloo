// The world package (sw-architecture.md 14.4, MAP-16, MAP-17): the format version 2 of `manifest.json`
// and `avatar/figures.json`, the figures' PixelLab metadata, the subset of Tiled's JSON that the platform
// accepts, and the limits of the validator. Shared, so the validator, the JSON Schemas and the admin
// area read the same rules.
import { z } from "zod";
import { doorSheetSchema } from "./waiting.ts";

/** The format versions the platform reads (14.4). Version 1 was never released and is not read. */
export const WORLD_FORMAT_VERSIONS = [2] as const;

export const WORLD_KIND = "zappaloo-world";

/** The limits of a package (14.4). */
export const WORLD_LIMITS = {
  archiveBytes: 40 * 1024 * 1024,
  unpackedBytes: 100 * 1024 * 1024,
  files: 3000,
  jsonBytes: 5 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  imageSide: 4096,
  /** The largest map, in tiles, along each side. */
  mapSide: 200,
  /** The size of one tile in pixels, width and height separately (isometric tiles are 2:1). */
  tileSide: { min: 8, max: 128 },
  /** The number of figures a world offers (decided 2026-11-15). */
  figures: 50,
  /** The side of one frame of a figure in pixels (its canvas, from PixelLab's `character.size`). */
  figureFrameSide: { min: 8, max: 256 },
  /** The walk frames of one direction of a figure. */
  walkFrames: { min: 1, max: 16 },
  /** Length of the names: the id of a map, an object, a figure; the label of a figure. */
  idLength: 40,
  labelLength: 30,
  nameLength: 60,
  /** The longest text of a map object's property (a content id, a table, a page). */
  propertyLength: 60,
} as const;

/** Map ids, object names, figure ids: `a–z 0–9 -`, 1–40 characters (14.4). */
export const WORLD_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/** The names of files in the package: a PNG name without folders, e.g. `frame_000.png`. */
export const WORLD_PNG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.png$/;

/** The pages a clickable object can open as a built-in overlay (14.2). */
export const WORLD_BUILTIN_PAGES = ["programme", "rsvp", "profile"] as const;

/** The object types of the map (14.2, 14.4). An untyped point (an `approach` point) is allowed too. */
export const WORLD_OBJECT_TYPES = [
  "spawn",
  "portal",
  "clickable",
  "decoration",
  "seat",
  "wander",
  "border",
  "collision",
  "protected",
] as const;
export type WorldObjectType = (typeof WORLD_OBJECT_TYPES)[number];

/** The actions a clickable object can carry as preset (14.2). */
export const WORLD_ACTIONS = ["page", "content", "dialog", "minigame"] as const;
export type WorldAction = (typeof WORLD_ACTIONS)[number];

/** The directions of a figure, as PixelLab names them. */
export const WORLD_DIRECTIONS = ["south", "west", "east", "north"] as const;

const idSchema = z.string().regex(WORLD_ID_PATTERN, "1–40 characters of a–z, 0–9 and -");

/** `manifest.json` of a world package, exactly these fields (14.4). `$schema` only names the schema. */
export const worldManifestSchema = z.strictObject({
  $schema: z.string().optional(),
  kind: z.literal(WORLD_KIND),
  formatVersion: z.literal(2),
  name: z.string().trim().min(1).max(WORLD_LIMITS.nameLength),
  startMap: idSchema,
  tileWidth: z.number().int().min(WORLD_LIMITS.tileSide.min).max(WORLD_LIMITS.tileSide.max),
  tileHeight: z.number().int().min(WORLD_LIMITS.tileSide.min).max(WORLD_LIMITS.tileSide.max),
});
export type WorldManifest = z.infer<typeof worldManifestSchema>;

/** One figure of `avatar/figures.json`: an id, an optional label, and its PixelLab metadata (14.4). */
export const worldFigureSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(WORLD_LIMITS.labelLength).optional(),
  /** The metadata file, relative to `avatar/figures.json`, e.g. `wedding-guest/metadata.json`. */
  metadata: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}\.json$/, "the path of a JSON file in avatar/"),
});
export type WorldFigure = z.infer<typeof worldFigureSchema>;

/** `avatar/figures.json`: the complete figures a guest can choose from (14.4, 7.3). */
export const worldFiguresSchema = z.strictObject({
  $schema: z.string().optional(),
  figures: z.array(worldFigureSchema).min(1).max(WORLD_LIMITS.figures),
});
export type WorldFigures = z.infer<typeof worldFiguresSchema>;

/**
 * The PixelLab metadata of a figure (`metadata.json`). Only the fields the platform uses are named; all
 * other fields are ignored, which is the one exception to the rule that unknown fields are refused
 * (14.4). The first entry of `states` is the figure.
 */
export const pixelLabMetadataSchema = z.looseObject({
  states: z
    .array(
      z.looseObject({
        character: z.looseObject({
          size: z.looseObject({ width: z.number().int(), height: z.number().int() }),
        }),
        frames: z.looseObject({
          rotations: z.looseObject({
            south: z.string(),
            west: z.string(),
            east: z.string(),
            north: z.string(),
          }),
          animations: z.looseObject({
            walking: z.looseObject({
              south: z.array(z.string()),
              west: z.array(z.string()),
              east: z.array(z.string()),
              north: z.array(z.string()),
            }),
          }),
        }),
      }),
    )
    .min(1),
});
export type PixelLabMetadata = z.infer<typeof pixelLabMetadataSchema>;

/**
 * The stored choice of a guest's figure (AVA-02, 7.3): `{ "figure": "<id>" }`. An id that the active
 * world no longer has falls back to its first figure.
 */
export const avatarConfigSchema = z.strictObject({
  figure: idSchema,
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

/** `door/door.json` is the door scene of the waiting page (10.4), the same schema as in the platform. */
export { doorSheetSchema };

// --- Tiled JSON, the subset that 14.4 accepts. Other fields of Tiled's files are ignored. ---

const tiledPropertySchema = z.looseObject({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});
export type TiledProperty = z.infer<typeof tiledPropertySchema>;

const tiledPointSchema = z.strictObject({ x: z.number(), y: z.number() });

const tiledObjectSchema = z.looseObject({
  id: z.number().int().nonnegative(),
  /** The name of the object (unique among its typed objects, 14.4). */
  name: z.string().optional(),
  /** The type of the object (Tiled 1.10 and later). */
  type: z.string().optional(),
  /** The type of the object (Tiled 1.9). */
  class: z.string().optional(),
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  rotation: z.number().optional(),
  visible: z.boolean().optional(),
  /** A point object (Tiled's "point" shape). */
  point: z.boolean().optional(),
  /** An ellipse, refused by the platform. */
  ellipse: z.boolean().optional(),
  /** A text object, refused by the platform. */
  text: z.unknown().optional(),
  /** A tile object: the tile's global id. */
  gid: z.number().int().nonnegative().optional(),
  polygon: z.array(tiledPointSchema).optional(),
  polyline: z.array(tiledPointSchema).optional(),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledObject = z.infer<typeof tiledObjectSchema>;

const tiledObjectLayerBase = {
  id: z.number().int().optional(),
  name: z.string(),
  visible: z.boolean().optional(),
  properties: z.array(tiledPropertySchema).optional(),
};

export const tiledTileLayerSchema = z.looseObject({
  ...tiledObjectLayerBase,
  type: z.literal("tilelayer"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The tile ids: an array (encoding "csv") or Base64 text (encoding "base64"). */
  data: z.union([z.array(z.number().int().nonnegative()), z.string()]),
  encoding: z.enum(["csv", "base64"]).optional(),
  compression: z.string().optional(),
});
export type TiledTileLayer = z.infer<typeof tiledTileLayerSchema>;

export const tiledObjectLayerSchema = z.looseObject({
  ...tiledObjectLayerBase,
  type: z.literal("objectgroup"),
  objects: z.array(tiledObjectSchema),
});
export type TiledObjectLayer = z.infer<typeof tiledObjectLayerSchema>;

/** A tile of an image-collection tileset: its image and, optionally, collision and occlusion guides. */
export const tiledTileSchema = z.looseObject({
  id: z.number().int().nonnegative(),
  image: z.string().optional(),
  imagewidth: z.number().int().positive().optional(),
  imageheight: z.number().int().positive().optional(),
  objectgroup: z
    .looseObject({
      type: z.literal("objectgroup").optional(),
      objects: z.array(tiledObjectSchema),
    })
    .optional(),
});
export type TiledTile = z.infer<typeof tiledTileSchema>;

export const tiledTilesetSchema = z.looseObject({
  firstgid: z.number().int().positive(),
  name: z.string(),
  /** The image of a sheet tileset; an image-collection tileset has none and lists its `tiles`. */
  image: z.string().optional(),
  imagewidth: z.number().int().positive().optional(),
  imageheight: z.number().int().positive().optional(),
  margin: z.number().int().nonnegative().optional(),
  spacing: z.number().int().nonnegative().optional(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  tilecount: z.number().int().positive().optional(),
  columns: z.number().int().nonnegative().optional(),
  /** The tiles of an image-collection tileset, each with its own image. */
  tiles: z.array(tiledTileSchema).optional(),
  /** An external tileset file, refused: tilesets are embedded in the map. */
  source: z.string().optional(),
  tileoffset: z.looseObject({ x: z.number(), y: z.number() }).optional(),
  objectalignment: z.string().optional(),
});
export type TiledTileset = z.infer<typeof tiledTilesetSchema>;

/** A layer of a map: tile layers, object layers, and group layers, which hold layers of their own. */
export type TiledLayer =
  | TiledTileLayer
  | TiledObjectLayer
  | (z.infer<typeof tiledGroupLayerBase> & { layers: TiledLayer[] });

const tiledGroupLayerBase = z.looseObject({
  id: z.number().int().optional(),
  type: z.literal("group"),
  name: z.string(),
  visible: z.boolean().optional(),
  properties: z.array(tiledPropertySchema).optional(),
});

export const tiledLayerSchema: z.ZodType<TiledLayer> = z.lazy(() =>
  z.union([
    tiledTileLayerSchema,
    tiledObjectLayerSchema,
    tiledGroupLayerBase.extend({ layers: z.array(tiledLayerSchema) }),
  ]),
);

/** A Tiled map as the platform reads it: isometric, finite, embedded tilesets, nested layers. */
export const tiledMapSchema = z.looseObject({
  type: z.literal("map").optional(),
  orientation: z.literal("isometric"),
  infinite: z.boolean().optional(),
  width: z.number().int().min(1).max(WORLD_LIMITS.mapSide),
  height: z.number().int().min(1).max(WORLD_LIMITS.mapSide),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(tiledLayerSchema),
  tilesets: z.array(tiledTilesetSchema),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledMap = z.infer<typeof tiledMapSchema>;

// --- The API of the world (sw-architecture.md 14.4): the admin importer and the served world. ---

/** One finding of an import: a refusal lists every finding, the warnings come with an accepted world. */
export const worldFindingSchema = z.object({
  file: z.string(),
  object: z.string().optional(),
  code: z.string(),
  severity: z.enum(["error", "warning"]),
  detail: z.string(),
});
export type WorldFindingDto = z.infer<typeof worldFindingSchema>;

/** One map of the active world: its id, and how many clickable objects and portals it has (14.4). */
export const worldMapSummarySchema = z.object({
  id: z.string(),
  /** The name the admin area shows (the map property `name`); without it, the id is shown. */
  name: z.string().optional(),
  clickable: z.number().int().nonnegative(),
  portals: z.number().int().nonnegative(),
});
export type WorldMapSummary = z.infer<typeof worldMapSummarySchema>;

/** The active world as the admin area shows it (MAP-05). */
export const worldActiveSchema = z.object({
  importId: z.string(),
  name: z.string(),
  formatVersion: z.number().int().positive(),
  /** ISO date-time of the import. */
  importedAt: z.string(),
  startMap: z.string(),
  tileWidth: z.number().int(),
  tileHeight: z.number().int(),
  maps: z.array(worldMapSummarySchema),
  figures: z.number().int().nonnegative(),
  hasDoor: z.boolean(),
  /** The warnings of the import (MAP-08): presets that point to nothing, minigame presets. */
  warnings: z.array(worldFindingSchema),
});
export type WorldActive = z.infer<typeof worldActiveSchema>;

/** `GET /api/admin/world` (MAP-05, MAP-09). */
export const worldStatusSchema = z.object({
  active: worldActiveSchema.nullable(),
  previous: z.object({ name: z.string(), importedAt: z.string() }).nullable(),
});
export type WorldStatus = z.infer<typeof worldStatusSchema>;

/** `GET /api/world`: what a player's browser needs to load the world (MAP-10). `version` is the import id. */
export const publicWorldSchema = z.object({
  version: z.string(),
  name: z.string(),
  startMap: z.string(),
  tileWidth: z.number().int(),
  tileHeight: z.number().int(),
  maps: z.array(z.string()),
  /** The figures a guest can choose; `metadata` is relative to `avatar/`. */
  figures: z.array(worldFigureSchema),
});
export type PublicWorld = z.infer<typeof publicWorldSchema>;

/** A refused import: the error and every finding of the package (MAP-06). */
export const worldRefusalSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  findings: z.array(worldFindingSchema),
});
