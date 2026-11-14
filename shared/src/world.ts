// The world package (sw-architecture.md 14.4, MAP-16, MAP-17): the format version 1 of `manifest.json`
// and `avatar/avatar.json`, the subset of Tiled's JSON that the platform accepts, and the limits of
// the validator. Shared, so the validator, the JSON Schemas and the admin area read the same rules.
import { z } from "zod";
import { doorSheetSchema } from "./waiting.ts";

/** The format versions the platform reads (14.4). */
export const WORLD_FORMAT_VERSIONS = [1] as const;

export const WORLD_KIND = "zappaloo-world";

/** The limits of a package (14.4). */
export const WORLD_LIMITS = {
  archiveBytes: 40 * 1024 * 1024,
  unpackedBytes: 100 * 1024 * 1024,
  files: 500,
  jsonBytes: 5 * 1024 * 1024,
  imageBytes: 8 * 1024 * 1024,
  imageSide: 4096,
  /** The largest map, in tiles, along each side. */
  mapSide: 200,
  tileSize: { min: 8, max: 64 },
  /** Avatar sprite sheets: the frame size in pixels. */
  frameSize: { min: 8, max: 64 },
  paletteCount: 8,
  paletteColours: 16,
  partOptions: 24,
  templates: 12,
  /** Length of the names: the id of a map, an object, an option; the label of a part. */
  idLength: 40,
  labelLength: 30,
  nameLength: 60,
  paletteNameLength: 20,
  /** The longest text of a map object's property (a label, a table, a content id). */
  propertyLength: 60,
} as const;

/** Map ids, object names, option ids: `a–z 0–9 -`, 1–40 characters (14.4). */
export const WORLD_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/** The names of files in the package: a PNG name without folders, e.g. `hair-short.png`. */
export const WORLD_PNG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.png$/;

/** The pages a clickable object can open as a built-in overlay (14.2). */
export const WORLD_BUILTIN_PAGES = ["programme", "rsvp", "profile"] as const;

/** The object types of the map (14.4). An untyped point (an `approach` point) is allowed too. */
export const WORLD_OBJECT_TYPES = [
  "spawn",
  "portal",
  "clickable",
  "decoration",
  "seat",
  "wander",
  "collision",
  "protected",
] as const;
export type WorldObjectType = (typeof WORLD_OBJECT_TYPES)[number];

/** The actions a clickable object can carry as preset (14.2). */
export const WORLD_ACTIONS = ["page", "content", "dialog", "minigame"] as const;
export type WorldAction = (typeof WORLD_ACTIONS)[number];

const idSchema = z.string().regex(WORLD_ID_PATTERN, "1–40 characters of a–z, 0–9 and -");
const colourSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "a colour as #rrggbb");

/** `manifest.json` of a world package, exactly these fields (14.4). `$schema` only names the schema. */
export const worldManifestSchema = z.strictObject({
  $schema: z.string().optional(),
  kind: z.literal(WORLD_KIND),
  formatVersion: z.literal(1),
  name: z.string().trim().min(1).max(WORLD_LIMITS.nameLength),
  startMap: idSchema,
  tileSize: z.number().int().min(WORLD_LIMITS.tileSize.min).max(WORLD_LIMITS.tileSize.max),
});
export type WorldManifest = z.infer<typeof worldManifestSchema>;

/**
 * The stored avatar (AVA-02, 7.3): option ids and colours as `#rrggbb`. `hair` and `accessory` may be
 * `null`; a colour that goes with a `null` part is `null` as well.
 */
export const avatarConfigSchema = z.strictObject({
  body: idSchema,
  skin: colourSchema,
  outfit: idSchema,
  outfitColor: colourSchema,
  hair: idSchema.nullable(),
  hairColor: colourSchema.nullable(),
  accessory: idSchema.nullable(),
});
export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

const avatarOptionSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(WORLD_LIMITS.labelLength),
  file: z.string().regex(WORLD_PNG_NAME_PATTERN, "the name of a PNG file in avatar/"),
  detail: z.string().regex(WORLD_PNG_NAME_PATTERN, "the name of a PNG file in avatar/").optional(),
});

const avatarPartSchema = z.strictObject({
  palette: z
    .string()
    .regex(/^[a-z0-9-]{1,20}$/, "1–20 characters of a–z, 0–9 and -")
    .optional(),
  optional: z.boolean().optional(),
  options: z.array(avatarOptionSchema).min(1).max(WORLD_LIMITS.partOptions),
});
export type AvatarPart = z.infer<typeof avatarPartSchema>;

/** The part names of the avatar, in the order they are drawn (14.4). */
export const AVATAR_PART_NAMES = ["body", "outfit", "hair", "accessory"] as const;
export type AvatarPartName = (typeof AVATAR_PART_NAMES)[number];

const avatarTemplateSchema = z.strictObject({
  label: z.string().trim().min(1).max(WORLD_LIMITS.labelLength),
  avatar: avatarConfigSchema,
});

/** `avatar/avatar.json`: the parts, palettes and templates of the avatar editor (14.4, 7.3). */
export const worldAvatarSchema = z.strictObject({
  $schema: z.string().optional(),
  frameWidth: z.number().int().min(WORLD_LIMITS.frameSize.min).max(WORLD_LIMITS.frameSize.max),
  frameHeight: z.number().int().min(WORLD_LIMITS.frameSize.min).max(WORLD_LIMITS.frameSize.max),
  palettes: z.record(
    z.string().regex(/^[a-z0-9-]{1,20}$/, "1–20 characters of a–z, 0–9 and -"),
    z.array(colourSchema).min(1).max(WORLD_LIMITS.paletteColours),
  ),
  parts: z.strictObject({
    body: avatarPartSchema,
    outfit: avatarPartSchema,
    hair: avatarPartSchema,
    accessory: avatarPartSchema,
  }),
  templates: z.array(avatarTemplateSchema).max(WORLD_LIMITS.templates),
});
export type WorldAvatar = z.infer<typeof worldAvatarSchema>;

/** `door/door.json` is the door scene of the waiting page (10.4), the same schema as in the platform. */
export { doorSheetSchema };

// --- Tiled JSON, the subset that 14.4 accepts. Other fields of Tiled's files are ignored. ---

const tiledPropertySchema = z.looseObject({
  name: z.string(),
  type: z.string().optional(),
  value: z.unknown(),
});
export type TiledProperty = z.infer<typeof tiledPropertySchema>;

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
  /** A tile object: the tile's global id. */
  gid: z.number().int().nonnegative().optional(),
  polygon: z.array(z.strictObject({ x: z.number(), y: z.number() })).optional(),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledObject = z.infer<typeof tiledObjectSchema>;

export const tiledTileLayerSchema = z.looseObject({
  id: z.number().int().optional(),
  type: z.literal("tilelayer"),
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /** The tile ids: an array (encoding "csv") or Base64 text (encoding "base64"). */
  data: z.union([z.array(z.number().int().nonnegative()), z.string()]),
  encoding: z.enum(["csv", "base64"]).optional(),
  compression: z.string().optional(),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledTileLayer = z.infer<typeof tiledTileLayerSchema>;

export const tiledObjectLayerSchema = z.looseObject({
  id: z.number().int().optional(),
  type: z.literal("objectgroup"),
  name: z.string(),
  objects: z.array(tiledObjectSchema),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledObjectLayer = z.infer<typeof tiledObjectLayerSchema>;

export const tiledTilesetSchema = z.looseObject({
  firstgid: z.number().int().positive(),
  name: z.string(),
  /** The image of the tileset; a tileset without an image is a collection, which is refused. */
  image: z.string().optional(),
  imagewidth: z.number().int().positive().optional(),
  imageheight: z.number().int().positive().optional(),
  margin: z.number().int().nonnegative().optional(),
  spacing: z.number().int().nonnegative().optional(),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  tilecount: z.number().int().positive().optional(),
  columns: z.number().int().nonnegative().optional(),
  /** An external tileset file, refused: tilesets are embedded in the map. */
  source: z.string().optional(),
});
export type TiledTileset = z.infer<typeof tiledTilesetSchema>;

/** A Tiled map as the platform reads it: orthogonal, embedded tilesets, tile and object layers. */
export const tiledMapSchema = z.looseObject({
  type: z.literal("map").optional(),
  orientation: z.literal("orthogonal"),
  infinite: z.boolean().optional(),
  width: z.number().int().min(1).max(WORLD_LIMITS.mapSide),
  height: z.number().int().min(1).max(WORLD_LIMITS.mapSide),
  tilewidth: z.number().int().positive(),
  tileheight: z.number().int().positive(),
  layers: z.array(z.union([tiledTileLayerSchema, tiledObjectLayerSchema])),
  tilesets: z.array(tiledTilesetSchema),
  properties: z.array(tiledPropertySchema).optional(),
});
export type TiledMap = z.infer<typeof tiledMapSchema>;
