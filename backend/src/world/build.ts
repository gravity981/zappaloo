// Builds the test world (sw-architecture.md 14.4, step 5d.1): three isometric maps with generated placeholder
// art, group layers, a sheet tileset and an image-collection tileset with collision and trigger guides,
// every object type, a polygon portal with its marker, and two figures in the PixelLab layout with generated
// frames. It passes every rule of the validator with no finding. The tests use it as their valid package,
// and the script `scripts/build-test-world.ts` writes it for development. The art is generated, not drawn:
// it is for checks, not for the game.
import { buildArchive, encodePng, encodePngPixels } from "../packages/build.ts";

export const TEST_WORLD_NAME = "Testwelt";

/** The tile size of the test world: isometric tiles are twice as wide as high (2:1). */
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;

/** Four placeholder tile colours, one per tile of a tileset. */
const TILE_COLOURS: [number, number, number][] = [
  [0x9c, 0xb8, 0x6e],
  [0x7a, 0x9e, 0x55],
  [0xc9, 0xb0, 0x7a],
  [0x6f, 0x6f, 0x78],
];

/**
 * A sheet image of `columns` × `rows` tiles. Each tile is a diamond of the isometric grid, transparent outside it;
 * the tiles alternate in colour, so they are told apart.
 */
function tilesetPng(columns: number, rows: number, transparent: boolean): Buffer {
  return encodePngPixels(columns * TILE_WIDTH, rows * TILE_HEIGHT, (x, y) => {
    const column = (x / TILE_WIDTH) | 0;
    const row = (y / TILE_HEIGHT) | 0;
    const index = column + row * columns;
    const [r, g, b] = TILE_COLOURS[index % TILE_COLOURS.length] ?? [0, 0, 0];
    const lx = (x % TILE_WIDTH) - TILE_WIDTH / 2;
    const ly = (y % TILE_HEIGHT) - TILE_HEIGHT / 2;
    const inside = Math.abs(lx) / (TILE_WIDTH / 2) + Math.abs(ly) / (TILE_HEIGHT / 2) <= 1;
    const hidden = transparent && index % TILE_COLOURS.length === 1;
    return [r, g, b, inside && !hidden ? 255 : 0];
  });
}

/** Tile data of a Tiled layer as CSV: the ids of `width` × `height` tiles, row by row. */
function csv(width: number, height: number, tile: (x: number, y: number) => number): number[] {
  const data: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.push(tile(x, y));
  }
  return data;
}

/** Tile data as Base64 of little-endian 32-bit ids (Tiled's uncompressed Base64 format). */
function base64(width: number, height: number, tile: (x: number, y: number) => number): string {
  const bytes = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) bytes.writeUInt32LE(tile(x, y), (y * width + x) * 4);
  }
  return bytes.toString("base64");
}

/** The gid of the portal tile: an arrow of 64 × 32 whose trigger area is its diamond (14.2, changed 2026-11-16). */
const PORTAL = 80;

/** The image-collection tileset `portale`: the portal tile, with its `trigger` polygon. */
function portals() {
  return {
    firstgid: PORTAL,
    name: "portale",
    objectalignment: "bottom",
    columns: 0,
    tilecount: 1,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    tiles: [
      {
        id: 0,
        image: "../tilesets/portal.png",
        imagewidth: TILE_WIDTH,
        imageheight: TILE_HEIGHT,
        objectgroup: {
          type: "objectgroup",
          name: "",
          draworder: "index",
          objects: [
            {
              id: 1,
              name: "trigger",
              x: 0,
              y: 0,
              polygon: [
                { x: 32, y: 0 },
                { x: 64, y: 16 },
                { x: 32, y: 32 },
                { x: 0, y: 16 },
              ],
            },
          ],
        },
      },
    ],
  };
}

/** The edge of a map as walls: the collision tile on the edge, nothing inside. */
const border = (width: number, height: number) => (x: number, y: number) =>
  x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0;

interface TiledProperty {
  name: string;
  type?: string;
  value: string | number | boolean;
}

function property(name: string, value: string | number | boolean): TiledProperty {
  const type = typeof value === "boolean" ? "bool" : typeof value === "number" ? "int" : "string";
  return { name, type, value };
}

/**
 * Tiled stores the positions of an isometric map's objects in tile space, scaled by the tile size (x is the column
 * times the tile width). The helpers below describe positions on screen, as the game draws them, and convert them.
 */
function tiledVector(dx: number, dy: number): { x: number; y: number } {
  // The inverse of the game's projection: the tile of a screen vector, scaled by half the tile width.
  const tileX = (dx / (TILE_WIDTH / 2) + dy / (TILE_HEIGHT / 2)) / 2;
  const tileY = (dy / (TILE_HEIGHT / 2) - dx / (TILE_WIDTH / 2)) / 2;
  return { x: tileX * (TILE_WIDTH / 2), y: tileY * (TILE_WIDTH / 2) };
}

/** A Tiled object; `kind` is the object's type. Extra fields carry the shape (polygon, point, gid). */
function object(
  id: number,
  name: string,
  kind: string,
  box: { x: number; y: number; width?: number; height?: number },
  properties: TiledProperty[] = [],
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    name,
    type: kind,
    ...tiledVector(box.x, box.y),
    width: box.width ?? 0,
    height: box.height ?? 0,
    rotation: 0,
    visible: true,
    properties,
    ...extra,
  };
}

/** A point object; a point without a type (an approach point) has `kind` = "". */
function point(
  id: number,
  name: string,
  kind: string,
  x: number,
  y: number,
  properties: TiledProperty[] = [],
) {
  return object(id, name, kind, { x, y }, properties, { point: true });
}

/** A tile object: the tile's global id, drawn from the tileset that holds it. */
function tileObject(
  id: number,
  name: string,
  kind: string,
  box: { x: number; y: number; width: number; height: number },
  gid: number,
  properties: TiledProperty[] = [],
) {
  return object(id, name, kind, box, properties, { gid });
}

/** A polygon, with its points relative to the object's position (Tiled's convention). */
const polygon = (points: [number, number][]) => ({
  polygon: points.map(([x, y]) => tiledVector(x, y)),
});

function tiledLayer(
  id: number,
  name: string,
  width: number,
  height: number,
  data: number[] | string,
  encoding?: "csv" | "base64",
  visible = true,
) {
  return {
    id,
    type: "tilelayer",
    name,
    width,
    height,
    x: 0,
    y: 0,
    opacity: 1,
    visible,
    data,
    ...(encoding === undefined ? {} : { encoding }),
  };
}

function objectLayer(id: number, name: string, objects: unknown[], visible = true) {
  return {
    id,
    type: "objectgroup",
    name,
    objects,
    x: 0,
    y: 0,
    opacity: 1,
    visible,
    draworder: "topdown",
  };
}

function groupLayer(id: number, name: string, layers: unknown[]) {
  return { id, type: "group", name, layers, x: 0, y: 0, opacity: 1, visible: true };
}

/** An embedded sheet tileset of one image in `tilesets/`. */
function sheet(firstgid: number, name: string, columns: number, rows: number) {
  return {
    firstgid,
    name,
    objectalignment: "bottom",
    image: `../tilesets/${name}.png`,
    imagewidth: columns * TILE_WIDTH,
    imageheight: rows * TILE_HEIGHT,
    margin: 0,
    spacing: 0,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    tilecount: columns * rows,
    columns,
  };
}

/**
 * The image-collection tileset `gebaeude`: one PNG per tile, with gaps in the tile ids. Tile 0 is a house
 * with a collision polygon, tile 3 a sign with a collision rectangle only.
 */
function collection(firstgid: number) {
  return {
    firstgid,
    name: "gebaeude",
    objectalignment: "bottom",
    columns: 0,
    tilecount: 2,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    tiles: [
      {
        id: 0,
        image: "../tilesets/gebaeude-haus.png",
        imagewidth: 128,
        imageheight: 96,
        properties: [property("category", "building")],
        objectgroup: {
          type: "objectgroup",
          name: "",
          draworder: "topdown",
          objects: [
            {
              id: 1,
              name: "collision",
              x: 0,
              y: 0,
              polygon: [
                { x: 8, y: 80 },
                { x: 64, y: 96 },
                { x: 120, y: 80 },
                { x: 120, y: 56 },
                { x: 64, y: 40 },
                { x: 8, y: 56 },
              ],
            },
          ],
        },
      },
      {
        id: 3,
        image: "../tilesets/gebaeude-schild.png",
        imagewidth: 32,
        imageheight: 48,
        objectgroup: {
          type: "objectgroup",
          name: "",
          draworder: "index",
          objects: [{ id: 1, name: "collision", x: 4, y: 40, width: 24, height: 8 }],
        },
      },
    ],
  };
}

/** A Tiled map of `width` × `height` tiles around its tilesets and layers, isometric. */
function tiledMap(
  width: number,
  height: number,
  tilesets: unknown[],
  layers: unknown[],
  properties: TiledProperty[] = [],
) {
  return {
    type: "map",
    version: "1.10",
    tiledversion: "1.10.2",
    orientation: "isometric",
    renderorder: "right-down",
    infinite: false,
    width,
    height,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    nextlayerid: 100,
    nextobjectid: 100,
    properties,
    tilesets,
    layers,
  };
}

const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** The maps of the test world, by their ids. */
function maps(): Record<string, unknown> {
  // Kirche: the start map. Every object type is placed here or in the other maps.
  const kirche = tiledMap(
    12,
    10,
    [
      sheet(1, "boden", 4, 4),
      sheet(17, "dekor", 4, 2),
      sheet(25, "objekte", 3, 1),
      collection(30),
      portals(),
    ],
    [
      groupLayer(1, "Terrain", [
        tiledLayer(
          2,
          "boden",
          12,
          10,
          base64(12, 10, (x, y) => 1 + ((x + y) % 4)),
          "base64",
        ),
        tiledLayer(
          3,
          "dekor",
          12,
          10,
          csv(12, 10, (x, y) => (x === 5 && y === 5 ? 17 : 0)),
        ),
      ]),
      groupLayer(4, "Entities", [
        objectLayer(5, "Gebaeude", [
          tileObject(6, "", "decoration", { x: 320, y: 96, width: 128, height: 96 }, 30),
          tileObject(7, "", "decoration", { x: 480, y: 160, width: 32, height: 48 }, 33),
        ]),
      ]),
      groupLayer(8, "Gameplay", [
        objectLayer(
          9,
          "Gameplay",
          [
            point(1, "start", "spawn", 160, 200),
            point(2, "eingang", "spawn", 160, 40),
            tileObject(3, "zum-garten", "portal", { x: 0, y: 192, width: 64, height: 32 }, PORTAL, [
              property("targetMap", "garten"),
              property("targetSpawn", "start"),
            ]),
            tileObject(4, "altar", "clickable", { x: 96, y: 96, width: 64, height: 32 }, 25, [
              property("label", "Programm"),
              property("action", "page"),
              property("page", "programme"),
            ]),
            object(
              5,
              "schild",
              "clickable",
              { x: 128, y: 128, width: 16, height: 16 },
              [
                property("action", "content"),
                property("contentId", "anreise"),
                property("approach", "anfahrt"),
              ],
              polygon([
                [0, 0],
                [16, 0],
                [16, 16],
                [0, 16],
              ]),
            ),
            point(6, "anfahrt", "", 128, 152),
            object(7, "pastor", "clickable", { x: 64, y: 112, width: 16, height: 16 }, [
              property("label", "Pfarrer"),
              property("action", "dialog"),
              property("contentId", "npc-pastor"),
            ]),
            object(8, "osterei", "clickable", { x: 32, y: 32, width: 16, height: 16 }, [
              property("hidden", true),
            ]),
            object(10, "", "collision", { x: 64, y: 64, width: 32, height: 16 }),
            object(
              13,
              "",
              "border",
              { x: 200, y: 40 },
              [],
              polygon([
                [0, 0],
                [120, 0],
                [120, 60],
                [0, 60],
              ]),
            ),
            object(11, "sakristei", "protected", { x: 256, y: 32, width: 32, height: 32 }),
          ],
          true,
        ),
      ]),
    ],
    [property("name", "Kirche")],
  );

  // Garten: portals to the church and the hall, a wander area with a polygon, a minigame.
  const garten = tiledMap(
    14,
    10,
    [sheet(1, "boden", 4, 4), sheet(17, "dekor", 4, 2), portals()],
    [
      tiledLayer(
        1,
        "boden",
        14,
        10,
        csv(14, 10, (x, y) => 1 + ((x * 2 + y) % 4)),
      ),
      tiledLayer(2, "collision", 14, 10, csv(14, 10, border(14, 10))),
      objectLayer(3, "Gameplay", [
        point(1, "start", "spawn", 64, 64),
        tileObject(2, "zur-kirche", "portal", { x: 0, y: 32, width: 64, height: 32 }, PORTAL, [
          property("targetMap", "kirche"),
          property("targetSpawn", "eingang"),
        ]),
        tileObject(3, "zum-saal", "portal", { x: 304, y: 232, width: 64, height: 32 }, PORTAL, [
          property("targetMap", "saal"),
          property("targetSpawn", "start"),
        ]),
        object(
          4,
          "wiese",
          "wander",
          { x: 100, y: 100 },
          [],
          polygon([
            [0, 0],
            [200, 0],
            [200, 100],
            [0, 100],
          ]),
        ),
        object(5, "spiel", "clickable", { x: 160, y: 96, width: 16, height: 16 }, [
          property("action", "minigame"),
          property("minigameId", "quiz-01"),
        ]),
        object(6, "bank", "clickable", { x: 200, y: 48, width: 16, height: 16 }, [
          property("label", "Bank"),
        ]),
        tileObject(7, "", "decoration", { x: 96, y: 160, width: 64, height: 32 }, 17),
      ]),
    ],
    [property("name", "Garten")],
  );

  // Saal: the banquet hall with seats at two tables, a wander area and a dialogue sign.
  const saal = tiledMap(
    12,
    10,
    [sheet(1, "boden", 4, 4), sheet(17, "dekor", 4, 2), portals()],
    [
      tiledLayer(
        1,
        "boden",
        12,
        10,
        base64(12, 10, (x, y) => 1 + ((x + y) % 4)),
        "base64",
      ),
      tiledLayer(2, "collision", 12, 10, csv(12, 10, border(12, 10))),
      objectLayer(3, "Gameplay", [
        point(1, "start", "spawn", 160, 160),
        tileObject(2, "zum-garten", "portal", { x: 0, y: 192, width: 64, height: 32 }, PORTAL, [
          property("targetMap", "garten"),
          property("targetSpawn", "start"),
        ]),
        point(3, "platz-1", "seat", 80, 80, [property("table", "1")]),
        point(4, "platz-2", "seat", 96, 80, [property("table", 3)]),
        object(5, "tanzflaeche", "wander", { x: 64, y: 64, width: 96, height: 64 }),
        object(6, "sprecher", "clickable", { x: 240, y: 96, width: 16, height: 16 }, [
          property("action", "content"),
          property("contentId", "anreise"),
        ]),
      ]),
    ],
    [property("name", "Saal")],
  );

  return { kirche, garten, saal };
}

/** The frames of a figure: the standing pose of four directions and a walk of three frames each. */
const WALK_FRAMES = 3;
export const FIGURE_SIDE = 16;

/** A figure's frame: a head and a body in its colour, transparent around them. */
function figureFrame(colour: [number, number, number]): Buffer {
  return encodePngPixels(FIGURE_SIDE, FIGURE_SIDE, (x, y) => {
    const head = (x - 8) ** 2 + (y - 4) ** 2 <= 9;
    const body = x >= 4 && x < 12 && y >= 8 && y < 16;
    const [r, g, b] = colour;
    return [r, g, b, head || body ? 255 : 0];
  });
}

/** One figure's PixelLab metadata, its frames and the folder they sit in. */
function figure(folder: string, colour: [number, number, number]): Record<string, Buffer> {
  const frame = () => figureFrame(colour);
  const directions = ["south", "west", "east", "north"] as const;
  const rotations = Object.fromEntries(directions.map((d) => [d, `Idle/rotations/${d}.png`]));
  const walking = Object.fromEntries(
    directions.map((d) => [
      d,
      Array.from(
        { length: WALK_FRAMES },
        (_, index) => `Idle/animations/walking/${d}/frame_${String(index).padStart(3, "0")}.png`,
      ),
    ]),
  );
  const metadata = {
    group_id: `${folder}-group`,
    states: [
      {
        character: {
          id: `${folder}-character`,
          name: "Idle",
          prompt: "A wedding guest, full body, standing pose.",
          size: { width: FIGURE_SIDE, height: FIGURE_SIDE },
          template_id: "mannequin",
          directions: 4,
          view: "high top-down",
        },
        folder: "Idle",
        frames: { rotations, animations: { walking } },
      },
    ],
    export_version: "1",
  };
  const files: Record<string, Buffer> = {
    [`avatar/${folder}/metadata.json`]: json(metadata),
  };
  for (const d of directions) {
    files[`avatar/${folder}/Idle/rotations/${d}.png`] = frame();
    for (let index = 0; index < WALK_FRAMES; index++) {
      files[
        `avatar/${folder}/Idle/animations/walking/${d}/frame_${String(index).padStart(3, "0")}.png`
      ] = frame();
    }
  }
  return files;
}

/** The files of the test world, by their paths in the archive. */
export function testWorldFiles(): Record<string, Buffer> {
  const files: Record<string, Buffer> = {
    "manifest.json": json({
      kind: "zappaloo-world",
      formatVersion: 2,
      name: TEST_WORLD_NAME,
      startMap: "kirche",
      tileWidth: TILE_WIDTH,
      tileHeight: TILE_HEIGHT,
    }),
    "tilesets/boden.png": tilesetPng(4, 4, false),
    "tilesets/dekor.png": tilesetPng(4, 2, true),
    "tilesets/objekte.png": tilesetPng(3, 1, false),
    "tilesets/gebaeude-haus.png": encodePng(128, 96, [0xb0, 0x6a, 0x4a]),
    "tilesets/gebaeude-schild.png": encodePng(32, 48, [0xf2, 0xd3, 0x8a]),
    "tilesets/portal.png": encodePng(64, 32, [0xe0, 0x4a, 0x9c]),
    "avatar/figures.json": json({
      figures: [
        {
          id: "wedding-guest",
          label: "Gast",
          type: "female",
          tier: "tier1",
          metadata: "wedding-guest/metadata.json",
        },
        { id: "male-guest", type: "male", tier: "tier1", metadata: "male-guest/metadata.json" },
        { id: "kid", label: "Kind", type: "child", tier: "tier1", metadata: "kid/metadata.json" },
        {
          id: "crew",
          label: "Team",
          type: "other",
          tier: "tier2",
          metadata: "crew/metadata.json",
        },
        {
          id: "pastor",
          label: "Pfarrer",
          type: "male",
          tier: "tier3",
          metadata: "pastor/metadata.json",
        },
      ],
    }),
    "door/door.json": json({
      frameWidth: 32,
      frameHeight: 32,
      frames: 4,
      fps: 4,
      gap: { x: 0.35, y: 0.2, width: 0.3, height: 0.6 },
    }),
    "door/door.png": encodePng(128, 32, [0x8a, 0x5a, 0x3a]),
    "door/door-glimpse.png": encodePng(64, 64, [0xf2, 0xd3, 0x8a]),
    ...figure("wedding-guest", [0xb0, 0x2a, 0x3a]),
    ...figure("male-guest", [0x2a, 0x3a, 0xb0]),
    ...figure("kid", [0xe0, 0xa0, 0x2a]),
    ...figure("crew", [0x2a, 0xa0, 0x6a]),
    ...figure("pastor", [0x30, 0x30, 0x30]),
  };
  for (const [id, map] of Object.entries(maps())) {
    files[`maps/${id}.json`] = json(map);
  }
  return files;
}

/** The test world as a `tar.gz` package. The same bytes on every run. */
export function buildTestWorld(): Buffer {
  return buildArchive(testWorldFiles());
}
