// The world package, format version 3 (sw-architecture.md 14.4, MAP-20). Version 3 adds to version 2: the bird in
// `ambient/`, the map switches `clouds`, `birds` and `fog` (story 6e), and in the same version the tile animations,
// the NPCs, their polyline paths, the figure tier `npc` and the wave animation (stories 6f and 6g). It drops the
// object type `seat`. The platform reads versions 2 and 3; each package is checked against the rules of its own
// version (decided 2026-11-18). Written as the changes to version 2, so the two cannot drift apart where they agree.
import { WORLD_LIMITS } from "../world.ts";
import type { WorldFindingCode } from "./codes.ts";
import type { LayoutEntry, PackageDefinition, RuleDefinition } from "./definition.ts";
import { worldV2 } from "./world-v2.ts";

const range = (min: number, max: number): string => `${String(min)} to ${String(max)}`;

/** The v2 schema file of a layout entry as its v3 file. */
const forV3 = (entry: LayoutEntry): LayoutEntry =>
  entry.schemaFile === undefined
    ? entry
    : { ...entry, schemaFile: entry.schemaFile.replace(".v2.", ".v3.") };

/** Rules of version 2 whose text changes in version 3, by id. */
const CHANGED: Record<string, Partial<RuleDefinition<WorldFindingCode>>> = {
  "manifest.version": {
    text: "The format version in `manifest.json` is one the platform reads: 2 or 3. A package is checked against the rules of its own version.",
  },
  "map.objects": {
    text: "Objects have one of the types of 14.2 and a shape that type allows. Spawn points, portals and clickable objects have a unique name. An untyped object is a point (an approach point). Ellipses, text and individually hidden objects are refused. Tile objects use their image's natural size and bottom alignment; scaling, rotation and flipping are refused. The type `seat` is not read any more: the seating plan lives in the platform, not in the world.",
  },
  "map.properties": {
    text: "The properties of each object type are present and valid: a portal is a tile object whose tile has a `trigger` polygon or rectangle and names a map and a spawn point (both or neither), a clickable object's action comes with its property (`page`, `contentId` or `minigameId`). The map property `name`, if given, is the name the admin area shows: 1–60 characters. The map properties `clouds`, `birds` and `fog`, if given, are booleans: an effect is on unless it is set to `false` (an indoor map turns them off).",
  },
  "map.tileset": {
    text: "Tilesets are embedded. A sheet tileset has the tile width and height of the world and uses one image from `tilesets/`, a whole number of tiles; an image-collection tileset uses one PNG per tile, each from `tilesets/`, of any size, with the size stated in the tileset (the objects of a map, such as buildings or signs, are image collections). The tile ids do not overlap. Non-zero tile offsets are refused. A tileset used by tile objects must use bottom alignment. The animation of an image-collection tile is checked by `map.animation`.",
  },
  "figure.unreferenced": {
    text: "Every PNG and metadata file in `avatar/` is named by a figure, through `figures.json` or its metadata; every PNG in `ambient/` is named by the metadata of the bird.",
  },
};

const BIRD_RULES: RuleDefinition<WorldFindingCode>[] = [
  {
    id: "bird.metadata",
    scope: "validator",
    severity: "error",
    requirements: ["MAP-20", "GAME-32"],
    text: "`ambient/bird/metadata.json`, which is optional (without it there are no birds), is a PixelLab metadata file like a figure's: its first state names the canvas (`character.size`), the standing pose of the four directions and the animation `flying` for `east` and `west`; `south` and `north` may be there too.",
    codes: ["bird_metadata"],
  },
  {
    id: "bird.frames",
    scope: "validator",
    severity: "error",
    requirements: ["MAP-20", "GAME-32"],
    text: `Every frame the bird's metadata lists is a PNG in \`ambient/bird/\` of exactly the canvas size, with a side of ${range(WORLD_LIMITS.figureFrameSide.min, WORLD_LIMITS.figureFrameSide.max)} pixels, named as the frames of a figure; each direction of the animation has the same number of frames, ${range(WORLD_LIMITS.flyFrames.min, WORLD_LIMITS.flyFrames.max)}. The frames are played at 8 frames per second.`,
    codes: ["bird_frame"],
  },
];

const ANIMATION_RULES: RuleDefinition<WorldFindingCode>[] = [
  {
    id: "map.animation",
    scope: "validator",
    severity: "error",
    requirements: ["MAP-20", "GAME-35"],
    text: `The animation of an image-collection tile has ${range(WORLD_LIMITS.tileAnimationFrames.min, WORLD_LIMITS.tileAnimationFrames.max)} frames, each the id of a tile of the same tileset with a picture of exactly the size of the animated tile's own picture, and a duration of ${range(WORLD_LIMITS.tileAnimationDuration.min, WORLD_LIMITS.tileAnimationDuration.max)} milliseconds. The animation of a sheet tile is ignored.`,
    codes: ["map_animation"],
  },
];

const AMBIENT_LAYOUT: LayoutEntry[] = [
  {
    path: "ambient",
    match: /^ambient$/,
    kind: "folder",
    required: false,
    many: false,
    purpose: "The things that pass through the world: the bird.",
  },
  {
    path: "ambient/bird/",
    match: /^ambient\/.+$/,
    kind: "folder",
    required: false,
    many: false,
    purpose: "The folder of the bird, with its PixelLab metadata and frames, in any sub-folders.",
  },
  {
    path: "ambient/bird/metadata.json",
    match: /^ambient\/bird\/metadata\.json$/,
    kind: "json",
    required: false,
    many: false,
    purpose:
      "The PixelLab metadata of the bird, unchanged. Only the fields of 14.4 are read; the others are ignored. Without it there are no birds.",
  },
  {
    path: "ambient/bird/{frame}.png",
    match: /^ambient\/bird\/(?:[^/]+\/)*[^/]+\.png$/,
    kind: "png",
    required: false,
    many: true,
    purpose:
      "A frame of the bird: the standing pose per direction and the flying frames, named by the metadata.",
    sizeNote: "the canvas of the bird (`character.size` in its metadata)",
  },
];

export const worldV3: PackageDefinition<WorldFindingCode> = {
  ...worldV2,
  formatVersion: 3,
  summary:
    "The game world of an event as one `tar.gz` archive: isometric Tiled maps, their tilesets, the complete figures the guests choose from, a bird that now and then flies through the view and, optionally, the door scene of the waiting page. The whole world is imported at once; a new package replaces it.",
  limits: [
    ...worldV2.limits,
    {
      label: "Flying frames per direction",
      value: range(WORLD_LIMITS.flyFrames.min, WORLD_LIMITS.flyFrames.max),
      requirement: "MAP-20",
    },
  ],
  layout: [...worldV2.layout.map(forV3), ...AMBIENT_LAYOUT],
  rules: [
    ...worldV2.rules.map((rule) => ({ ...rule, ...CHANGED[rule.id] })),
    ...BIRD_RULES,
    ...ANIMATION_RULES,
  ],
  changes: [
    ...worldV2.changes,
    {
      date: "2026-11-18",
      text: "Format version 3 (epic 6) adds to version 2: the map properties `clouds`, `birds` and `fog` and the bird in `ambient/bird/` (story 6e), tile animations (6f), NPCs with their paths, the figure tier `npc` and the wave animation (6g). It drops the object type `seat`. The platform reads versions 2 and 3.",
    },
  ],
};
