// The world package (sw-architecture.md 14.4, MAP-16, MAP-17): the format versions 2 and 3 of `manifest.json`
// and `avatar/figures.json`, the figures' PixelLab metadata, the subset of Tiled's JSON that the platform
// accepts, and the limits of the validator. Shared, so the validator, the JSON Schemas and the admin
// area read the same rules.
import { z } from "zod";
import { doorSheetSchema } from "./waiting.ts";

/**
 * The format versions the platform reads (14.4, MAP-20). Version 1 was never released and is not read; version 2 stays
 * readable next to version 3, which adds to it (decided 2026-11-18, epic 6).
 */
export const WORLD_FORMAT_VERSIONS = [2, 3] as const;
export type WorldFormatVersion = (typeof WORLD_FORMAT_VERSIONS)[number];

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
  /** The flying frames of one direction of the bird (format version 3). */
  flyFrames: { min: 1, max: 16 },
  /** The frames of a tile animation and the duration of one frame in milliseconds (format version 3). */
  tileAnimationFrames: { min: 1, max: 32 },
  tileAnimationDuration: { min: 20, max: 10_000 },
  /** Length of the names: the id of a map, an object, a figure; the label of a figure. */
  idLength: 40,
  labelLength: 30,
  nameLength: 60,
  /** The longest short dialog of an NPC, in characters (MAP-21). */
  /** The longest text of a map object's property (a content id, a table, a page). */
  propertyLength: 60,
} as const;

/** Map ids, object names, figure ids: `a–z 0–9 -`, 1–40 characters (14.4). */
export const WORLD_ID_PATTERN = /^[a-z0-9-]{1,40}$/;

/** The names of files in the package: a PNG name without folders, e.g. `frame_000.png`. */
export const WORLD_PNG_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.png$/;

/**
 * One folder or file name inside a package, as the world file route serves it: letters, digits, `.`, `_` and `-`,
 * starting with a letter or a digit. A name outside this pattern is not served, so the validator refuses it.
 */
export const WORLD_FILE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The pages a clickable object can open as a built-in overlay (14.2). */
export const WORLD_BUILTIN_PAGES = ["programme", "rsvp", "profile", "seating"] as const;

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

/** `manifest.json` of one format version: exactly these fields (14.4). `$schema` only names the schema. */
const manifestOf = <V extends WorldFormatVersion>(formatVersion: V) =>
  z.strictObject({
    $schema: z.string().optional(),
    kind: z.literal(WORLD_KIND),
    formatVersion: z.literal(formatVersion),
    name: z.string().trim().min(1).max(WORLD_LIMITS.nameLength),
    startMap: idSchema,
    tileWidth: z.number().int().min(WORLD_LIMITS.tileSide.min).max(WORLD_LIMITS.tileSide.max),
    tileHeight: z.number().int().min(WORLD_LIMITS.tileSide.min).max(WORLD_LIMITS.tileSide.max),
  });

/** `manifest.json` of format version 2. */
export const worldManifestV2Schema = manifestOf(2);
/** `manifest.json` of format version 3: the same fields. */
export const worldManifestV3Schema = manifestOf(3);
/** `manifest.json` of any version the platform reads. */
export const worldManifestSchema = z.discriminatedUnion("formatVersion", [
  worldManifestV2Schema,
  worldManifestV3Schema,
]);
export type WorldManifest = z.infer<typeof worldManifestSchema>;

/** The kinds of figure the avatar editor asks for first (7.3, decided 2026-11-17). */
export const WORLD_FIGURE_TYPES = ["male", "female", "child", "other"] as const;
export type WorldFigureType = (typeof WORLD_FIGURE_TYPES)[number];

/** The tiers of a figure: `tier1` for vip, `tier2` for staff, `tier3` for admin (7.3, decided 2026-11-17). */
export const WORLD_FIGURE_TIERS = ["tier1", "tier2", "tier3"] as const;
/** The tier of the figures that only NPCs use (format version 3, story 6g): no role and no companion chooses it. */
export const WORLD_NPC_TIER = "npc";
/** Every tier a figure can have in the newest format version: the tier of a role, or `npc`. */
export const WORLD_FIGURE_TIERS_V3 = [...WORLD_FIGURE_TIERS, WORLD_NPC_TIER] as const;
export type WorldFigureTier = (typeof WORLD_FIGURE_TIERS_V3)[number];

/** The tier each role may choose from; exact, not cumulative (7.3). */
export const WORLD_ROLE_TIERS = { vip: "tier1", staff: "tier2", admin: "tier3" } as const;

/**
 * One figure of `avatar/figures.json`: an id, an optional label, the kind, the mandatory tier and its
 * PixelLab metadata (14.4).
 */
export const worldFigureSchema = z.strictObject({
  id: idSchema,
  label: z.string().trim().min(1).max(WORLD_LIMITS.labelLength).optional(),
  /** The kind the editor asks for first. `other` is a kind of its own, so every figure names one. */
  type: z.enum(WORLD_FIGURE_TYPES),
  /** Who may choose the figure: `tier1` vip, `tier2` staff, `tier3` admin. */
  tier: z.enum(WORLD_FIGURE_TIERS),
  /** The metadata file, relative to `avatar/figures.json`, e.g. `wedding-guest/metadata.json`. */
  metadata: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}\.json$/, "the path of a JSON file in avatar/"),
});
export type WorldFigureV2 = z.infer<typeof worldFigureSchema>;

/**
 * One figure of format version 3: the tier `npc` besides those of the roles, and the optional `wave`, the name of an
 * animation of the figure's metadata that an NPC plays while it stands (14.4).
 */
export const worldFigureV3Schema = worldFigureSchema.extend({
  tier: z.enum(WORLD_FIGURE_TIERS_V3),
  /** The animation of the metadata an NPC waves with, e.g. `waving`. */
  wave: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,39}$/, "the name of an animation of the metadata")
    .optional(),
});
export type WorldFigure = z.infer<typeof worldFigureV3Schema>;

/** `avatar/figures.json`: the complete figures a guest can choose from (14.4, 7.3). */
export const worldFiguresSchema = z.strictObject({
  $schema: z.string().optional(),
  figures: z.array(worldFigureSchema).min(1).max(WORLD_LIMITS.figures),
});
export type WorldFiguresV2 = z.infer<typeof worldFiguresSchema>;

/** `avatar/figures.json` of format version 3. */
export const worldFiguresV3Schema = z.strictObject({
  $schema: z.string().optional(),
  figures: z.array(worldFigureV3Schema).min(1).max(WORLD_LIMITS.figures),
});
export type WorldFigures = z.infer<typeof worldFiguresV3Schema>;

/** An animation of a figure's metadata: the frames of each of the four directions. */
export const pixelLabDirectionsSchema = z.object({
  south: z.array(z.string()),
  west: z.array(z.string()),
  east: z.array(z.string()),
  north: z.array(z.string()),
});

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
 * The PixelLab metadata of the bird (`ambient/bird/metadata.json`, format version 3, GAME-32): the file structure of a
 * figure, with the animation `flying` instead of `walking`. A flock flies to the left or to the right, so `east` and
 * `west` are needed; `south` and `north` may be there and are checked when they are.
 */
export const pixelLabBirdSchema = z.looseObject({
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
            flying: z.looseObject({
              west: z.array(z.string()),
              east: z.array(z.string()),
              south: z.array(z.string()).optional(),
              north: z.array(z.string()).optional(),
            }),
          }),
        }),
      }),
    )
    .min(1),
});
export type PixelLabBird = z.infer<typeof pixelLabBirdSchema>;

/** The map properties that switch an effect off (format version 3, GAME-34); each is on unless set to `false`. */
export const WORLD_MAP_SWITCHES = ["clouds", "birds", "fog"] as const;
export type WorldMapSwitch = (typeof WORLD_MAP_SWITCHES)[number];

/** The folder and the metadata of the bird in a package of format version 3 (14.4). */
export const WORLD_BIRD_METADATA = "ambient/bird/metadata.json";

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
  x: z.number().optional(),
  y: z.number().optional(),
  offsetx: z.number().optional(),
  offsety: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  tintcolor: z.string().optional(),
  parallaxx: z.number().optional(),
  parallaxy: z.number().optional(),
  blendmode: z.string().optional(),
  properties: z.array(tiledPropertySchema).optional(),
};

export const tiledTileLayerSchema = z.looseObject({
  ...tiledObjectLayerBase,
  type: z.literal("tilelayer"),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  repeatx: z.boolean().optional(),
  repeaty: z.boolean().optional(),
  /** The tile ids: an array (encoding "csv") or Base64 text (encoding "base64"). */
  data: z.union([z.array(z.number().int().nonnegative()), z.string()]),
  encoding: z.enum(["csv", "base64"]).optional(),
  compression: z.string().optional(),
});
export type TiledTileLayer = z.infer<typeof tiledTileLayerSchema>;

export const tiledObjectLayerSchema = z.looseObject({
  ...tiledObjectLayerBase,
  type: z.literal("objectgroup"),
  draworder: z.enum(["topdown", "index"]).optional(),
  objects: z.array(tiledObjectSchema),
});
export type TiledObjectLayer = z.infer<typeof tiledObjectLayerSchema>;

/** A tile of an image-collection tileset: its image and, optionally, collision and trigger guides. */
export const tiledTileSchema = z.looseObject({
  id: z.number().int().nonnegative(),
  image: z.string().optional(),
  imagewidth: z.number().int().positive().optional(),
  imageheight: z.number().int().positive().optional(),
  animation: z
    .array(
      z.strictObject({
        tileid: z.number().int().nonnegative(),
        duration: z.number().int().positive(),
      }),
    )
    .optional(),
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
  objectalignment: z
    .enum([
      "topleft",
      "top",
      "topright",
      "left",
      "center",
      "right",
      "bottomleft",
      "bottom",
      "bottomright",
    ])
    .optional(),
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
  x: z.number().optional(),
  y: z.number().optional(),
  offsetx: z.number().optional(),
  offsety: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  tintcolor: z.string().optional(),
  parallaxx: z.number().optional(),
  parallaxy: z.number().optional(),
  blendmode: z.string().optional(),
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
  renderorder: z.enum(["right-down", "right-up", "left-down", "left-up"]).optional(),
  parallaxoriginx: z.number().optional(),
  parallaxoriginy: z.number().optional(),
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
  /** Whether guests may enter the world (MAP-19). */
  guestAccess: z.boolean(),
  /** The id of the dialogue that opens once on the first entry (GAME-17); null: no welcome. */
  welcomeDialogue: z.string().nullable(),
  active: worldActiveSchema.nullable(),
  previous: z.object({ name: z.string(), importedAt: z.string() }).nullable(),
});
export type WorldStatus = z.infer<typeof worldStatusSchema>;

/** `PUT /api/admin/world/guest-access` (MAP-19). */
export const worldGuestAccessRequestSchema = z.strictObject({ enabled: z.boolean() });

/** `PUT /api/admin/world/welcome-dialogue` (GAME-17): the dialogue's id, or null for no welcome. */
export const worldWelcomeRequestSchema = z.strictObject({ dialogue: z.string().min(1).nullable() });

// --- The actions of clickable objects (sw-architecture.md 14.2, GAME-06, MAP-15). ---

/** What activating a clickable object does: the preset of the Tiled file, or the admin's assignment. */
export const worldActionSchema = z.discriminatedUnion("kind", [
  /** A website page as an overlay: `programme`, `rsvp`, `profile` or `p/<slug>`, any content page. */
  z.strictObject({ kind: z.literal("page"), page: z.string().min(1).max(100) }),
  /** A dialogue the guest taps through (CNT-02). */
  z.strictObject({ kind: z.literal("dialog"), dialogId: z.string().min(1).max(100) }),
  /** A minigame (stage 8): only a preset of the Tiled file can name one. */
  z.strictObject({ kind: z.literal("minigame"), minigameId: z.string().min(1).max(100) }),
  /** Nothing happens. */
  z.strictObject({ kind: z.literal("none") }),
]);
export type WorldObjectAction = z.infer<typeof worldActionSchema>;

/** The actions an admin can assign: everything but the minigame (from stage 8). */
export const worldAssignableActionSchema = z.discriminatedUnion("kind", [
  worldActionSchema.options[0],
  worldActionSchema.options[1],
  worldActionSchema.options[3],
]);

/**
 * The preset action of a clickable object, from its Tiled custom properties (14.2): `action` with `page`,
 * `contentId` (a dialogue, or a content page, which is the page `p/<contentId>`) or `minigameId`. Undefined
 * without a valid preset.
 */
export function presetActionOf(
  properties: readonly { name: string; value: unknown }[] | undefined,
): WorldObjectAction | undefined {
  const value = (name: string): string | undefined => {
    const found = properties?.find((property) => property.name === name)?.value;
    return typeof found === "string" && found !== "" ? found : undefined;
  };
  const page = value("page");
  const contentId = value("contentId");
  const minigameId = value("minigameId");
  switch (value("action")) {
    case "page":
      return page === undefined ? undefined : { kind: "page", page };
    case "content":
      // A content page is shown like any website page, in the overlay (decided 2026-11-17).
      return contentId === undefined ? undefined : { kind: "page", page: `p/${contentId}` };
    case "dialog":
      return contentId === undefined ? undefined : { kind: "dialog", dialogId: contentId };
    case "minigame":
      return minigameId === undefined ? undefined : { kind: "minigame", minigameId };
    default:
      return undefined;
  }
}

/** An action the admin assigned to a clickable object of a map; it replaces the preset (MAP-15). */
export const worldActionOverrideSchema = z.strictObject({
  map: z.string(),
  object: z.string(),
  action: worldActionSchema,
});
export type WorldActionOverride = z.infer<typeof worldActionOverrideSchema>;

/** `PUT /api/admin/world/objects/:map/:object`: the action to assign, or null to return to the preset. */
export const worldActionRequestSchema = z.strictObject({
  action: worldAssignableActionSchema.nullable(),
});

/** One clickable object of a map, as the admin's list shows it (MAP-15). */
export const worldClickableSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  /** An easter egg: it does not sparkle (GAME-08). */
  hidden: z.boolean(),
  /** The preset of the Tiled file, if it has one. */
  preset: worldActionSchema.optional(),
  /** The admin's assignment, if there is one. */
  override: worldActionSchema.optional(),
  /** Whether the effective action points to something that does not exist (a missing page). */
  missing: z.boolean(),
  /** Whether the object shows its edge indicator and its label in the game; on unless the admin turns it off. */
  showIndicator: z.boolean().default(true),
});
export type WorldClickable = z.infer<typeof worldClickableSchema>;

/** One NPC of a map, as the admin's list shows it (MAP-21): its Tiled data and its assignment, like a clickable object. */
export const worldNpcSchema = z.object({
  name: z.string(),
  /** The Tiled `label`, which names the NPC while its action is not a dialogue or a page. */
  label: z.string().optional(),
  /** The preset action of the Tiled file, if it has one. */
  preset: worldActionSchema.optional(),
  /** The admin's assignment, if there is one. */
  override: worldActionSchema.optional(),
  /** Whether the effective action points to something that does not exist. */
  missing: z.boolean(),
  /** Whether the NPC shows its edge indicator and its label in the game; on unless the admin turns it off. */
  showIndicator: z.boolean().default(true),
});
export type WorldNpc = z.infer<typeof worldNpcSchema>;

/** `PUT /api/admin/world/objects/:map/:object/indicator`: whether the object or NPC shows its indicator and label. */
export const worldIndicatorRequestSchema = z.strictObject({ showIndicator: z.boolean() });

/** The setting `showIndicator` of an object or NPC of a map, by the map's id and its Tiled name. */
export const worldIndicatorSettingSchema = z.strictObject({
  map: z.string(),
  object: z.string(),
  showIndicator: z.boolean(),
});
export type WorldIndicatorSetting = z.infer<typeof worldIndicatorSettingSchema>;

/** One portal of a map, read-only (MAP-15). */
export const worldPortalSchema = z.object({
  name: z.string(),
  targetMap: z.string().optional(),
  targetSpawn: z.string().optional(),
});

/** `GET /api/admin/world/objects`: the objects of every map of the active world and what can be assigned. */
export const worldObjectsSchema = z.object({
  /** The id of the start map, which the admin's list marks with a star. */
  startMap: z.string(),
  maps: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      clickables: z.array(worldClickableSchema),
      /** The NPCs of the map (format version 3, MAP-21). */
      npcs: z.array(worldNpcSchema).default([]),
      portals: z.array(worldPortalSchema),
    }),
  ),
  /** The pages that can be shown as an overlay: `programme`, `rsvp`, `profile` and `p/<slug>` of every content page. */
  pages: z.array(z.string()),
  /** The ids of the dialogues the admin made (CNT-02). */
  dialogues: z.array(z.string()),
});
export type WorldObjects = z.infer<typeof worldObjectsSchema>;

/** What the game knows of an NPC whose action is a dialogue (GAME-37): the dialogue's figure name and greeting, and its portrait. */
export const publicNpcSchema = z.object({
  map: z.string(),
  name: z.string(),
  title: z.string().optional(),
  dialog: z.string().optional(),
  /** The address of the portrait of the NPC's dialogue, when its action is a dialogue that has one (CNT-08). */
  portrait: z.string().optional(),
});
export type PublicNpc = z.infer<typeof publicNpcSchema>;

/** `GET /api/world`: what a player's browser needs to load the world (MAP-10). `version` is the import id. */
export const publicWorldSchema = z.object({
  version: z.string(),
  name: z.string(),
  startMap: z.string(),
  tileWidth: z.number().int(),
  tileHeight: z.number().int(),
  maps: z.array(z.string()),
  /** The figures a guest can choose; `metadata` is relative to `avatar/`. */
  figures: z.array(worldFigureV3Schema),
  /** The actions the admin assigned to clickable objects; they replace the presets of the maps (MAP-15). */
  actions: z.array(worldActionOverrideSchema).default([]),
  /** The NPCs whose effective action is a dialogue (MAP-21, CNT-09): its figure name, greeting and portrait. */
  npcs: z.array(publicNpcSchema).default([]),
  /** The figure names of the dialogues by their ids: they name the objects and NPCs that show one (GAME-40). */
  dialogues: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  /**
   * The clickable objects (not the NPCs, which are in `npcs`) whose effective action is a dialogue with a greeting: the
   * text of the speech bubble they show over their top (GAME-37, CNT-09).
   */
  greetings: z
    .array(z.object({ map: z.string(), object: z.string(), greeting: z.string() }))
    .default([]),
  /**
   * The objects and NPCs whose `showIndicator` the admin changed (GAME-26, GAME-41); every other object and NPC
   * shows its edge indicator and label.
   */
  indicators: z.array(worldIndicatorSettingSchema).default([]),
  /** The id of the welcome dialogue that opens once on the first entry (GAME-17); null: nothing opens. */
  welcomeDialogue: z.string().nullable().default(null),
  /** Whether the world has a bird (`ambient/bird/metadata.json`, format version 3): without one there are no birds. */
  bird: z.boolean().default(false),
});
export type PublicWorld = z.infer<typeof publicWorldSchema>;

/** A refused import: the error and every finding of the package (MAP-06). */
export const worldRefusalSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
  findings: z.array(worldFindingSchema),
});

// --- The avatar (sw-architecture.md 7.3, AVA-01, AVA-02) ---

/** A figure a person may choose: what the editor shows (the tier stays on the server). */
export const avatarFigureSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  type: z.enum(WORLD_FIGURE_TYPES),
});
export type AvatarFigure = z.infer<typeof avatarFigureSchema>;

/** One person of the editor: the user (`me`) or an approved companion (the id of the companion). */
export const avatarPersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** The figure that applies: the chosen one, or the first the person may choose; null without a world. */
  figure: z.string().nullable(),
  /** Whether the person has chosen a figure; the first entry waits until everyone has. */
  chosen: z.boolean(),
  /** The figures this person may choose. */
  figures: z.array(avatarFigureSchema),
});

/** `GET /api/avatar`: the user and the approved companions, with the figures each may choose. */
export const avatarResponseSchema = z.object({ persons: z.array(avatarPersonSchema) });
export type AvatarResponse = z.infer<typeof avatarResponseSchema>;

/** `PUT /api/avatar/:person`. */
export const avatarRequestSchema = z.strictObject({ figure: idSchema });

/**
 * One wandering guest figure (PRES-01): `id` is stable (`u<user id>` or `c<companion id>`) and seeds the map pick
 * (PRES-02), `name` is the name tag, `figure` the id of the chosen figure.
 */
export const guestFigureSchema = z.object({
  id: z.string(),
  name: z.string(),
  figure: idSchema,
  /** What the speech bubble shows (PRES-10): the greeting, the name of the chosen relation option, the free line. */
  greeting: z.string().nullable(),
  badge: z.string().nullable(),
  line: z.string().nullable(),
  /** The version of the profile photo for its address, or null without a photo. */
  photo: z.number().int().nullable(),
});
export type GuestFigure = z.infer<typeof guestFigureSchema>;

/** `GET /api/world/guests`: the figures of the attending guests, the signed-in user's own left out (PRES-01). */
export const guestFiguresResponseSchema = z.object({ guests: z.array(guestFigureSchema) });
export type GuestFiguresResponse = z.infer<typeof guestFiguresResponseSchema>;
