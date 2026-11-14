// Builds the test world (sw-architecture.md 14.4, step 5b): three maps with generated placeholder tiles,
// all object types, the avatar assets and a door scene. It passes every rule of the validator with no
// findings. The tests use it as their valid package, and the script `scripts/build-test-world.ts`
// writes it for development. The art is generated, not drawn: it is for checks, not for the game.
import { buildArchive, encodePng, encodePngPixels } from "../packages/build.ts";

export const TEST_WORLD_NAME = "Testwelt";

const TILE = 16;

/** Four placeholder tile colours, one per tile of a tileset. */
const TILE_COLOURS: [number, number, number][] = [
  [0x9c, 0xb8, 0x6e],
  [0x7a, 0x9e, 0x55],
  [0xc9, 0xb0, 0x7a],
  [0x6f, 0x6f, 0x78],
];

/** A tileset image of `columns` × `rows` tiles; the tiles alternate in colour, so they are told apart. */
function tilesetPng(columns: number, rows: number, transparent: boolean): Buffer {
  return encodePngPixels(columns * TILE, rows * TILE, (x, y) => {
    const index = ((x >> 4) + (y >> 4) * columns) % TILE_COLOURS.length;
    const [r, g, b] = TILE_COLOURS[index] ?? [0, 0, 0];
    return [r, g, b, transparent && index === 1 ? 0 : 255];
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

/** The border of a map as walls: the id of the collision tile on the edge, nothing inside. */
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

/** A Tiled object; `kind` is the object's type (Tiled's class). */
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
    x: box.x,
    y: box.y,
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

function tiledLayer(
  id: number,
  name: string,
  width: number,
  height: number,
  data: number[] | string,
  encoding?: "csv" | "base64",
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
    visible: true,
    data,
    ...(encoding === undefined ? {} : { encoding }),
  };
}

function objectLayer(id: number, name: string, objects: unknown[]) {
  return {
    id,
    type: "objectgroup",
    name,
    objects,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    draworder: "topdown",
  };
}

/** An embedded tileset of one image in `tilesets/`. */
function tileset(firstgid: number, name: string, columns: number, rows: number) {
  return {
    firstgid,
    name,
    image: `../tilesets/${name}.png`,
    imagewidth: columns * TILE,
    imageheight: rows * TILE,
    margin: 0,
    spacing: 0,
    tilewidth: TILE,
    tileheight: TILE,
    tilecount: columns * rows,
    columns,
    tiles: [],
  };
}

/** A Tiled map of `width` × `height` tiles around its layers, tilesets and objects. */
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
    orientation: "orthogonal",
    renderorder: "right-down",
    infinite: false,
    width,
    height,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: layers.length + 1,
    nextobjectid: 100,
    properties,
    tilesets,
    layers,
  };
}

const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

/** The maps of the test world, by their ids. */
function maps(): Record<string, unknown> {
  // Kirche: the start map. Every object type is placed at least once in the three maps.
  const kirche = tiledMap(
    20,
    15,
    [tileset(1, "boden", 4, 4), tileset(17, "dekor", 4, 2), tileset(25, "objekte", 3, 1)],
    [
      tiledLayer(
        1,
        "boden",
        20,
        15,
        base64(20, 15, (x, y) => 1 + ((x + y) % 4)),
        "base64",
      ),
      tiledLayer(
        2,
        "dekor",
        20,
        15,
        csv(20, 15, (x, y) => (x === 5 && y === 5 ? 17 : 0)),
      ),
      tiledLayer(
        3,
        "above-dach",
        20,
        15,
        csv(20, 15, (x, y) => (y === 0 ? 2 : 0)),
      ),
      tiledLayer(4, "collision", 20, 15, csv(20, 15, border(20, 15))),
      objectLayer(5, "objekte", [
        point(1, "start", "spawn", 160, 200),
        point(2, "eingang", "spawn", 160, 40),
        object(3, "zum-garten", "portal", { x: 0, y: 200, width: 16, height: 32 }, [
          property("targetMap", "garten"),
          property("targetSpawn", "start"),
          property("label", "Garten"),
        ]),
        tileObject(4, "altar", "clickable", { x: 96, y: 96, width: 16, height: 16 }, 25, [
          property("label", "Programm"),
          property("action", "page"),
          property("page", "programme"),
        ]),
        object(5, "schild", "clickable", { x: 128, y: 128, width: 16, height: 16 }, [
          property("action", "content"),
          property("contentId", "anreise"),
          property("approach", "anfahrt"),
        ]),
        point(6, "anfahrt", "", 128, 152),
        object(7, "pastor", "clickable", { x: 64, y: 112, width: 16, height: 16 }, [
          property("label", "Pfarrer"),
          property("action", "dialog"),
          property("contentId", "npc-pastor"),
        ]),
        object(8, "osterei", "clickable", { x: 32, y: 32, width: 16, height: 16 }, [
          property("hidden", true),
        ]),
        tileObject(9, "", "decoration", { x: 48, y: 48, width: 16, height: 16 }, 26),
        object(10, "", "collision", { x: 64, y: 64, width: 32, height: 16 }),
        object(11, "sakristei", "protected", { x: 256, y: 32, width: 32, height: 32 }),
      ]),
    ],
  );

  // Garten: a portal to the church and to the hall, a wander area and a minigame.
  const garten = tiledMap(
    24,
    16,
    [tileset(1, "boden", 4, 4), tileset(17, "dekor", 4, 2)],
    [
      tiledLayer(
        1,
        "boden",
        24,
        16,
        csv(24, 16, (x, y) => 1 + ((x * 2 + y) % 4)),
      ),
      tiledLayer(2, "collision", 24, 16, csv(24, 16, border(24, 16))),
      objectLayer(3, "objekte", [
        point(1, "start", "spawn", 64, 64),
        object(2, "zur-kirche", "portal", { x: 0, y: 0, width: 16, height: 32 }, [
          property("targetMap", "kirche"),
          property("targetSpawn", "eingang"),
        ]),
        object(3, "zum-saal", "portal", { x: 304, y: 200, width: 16, height: 32 }, [
          property("targetMap", "saal"),
          property("targetSpawn", "start"),
        ]),
        object(4, "wiese", "wander", { x: 100, y: 100 }, [], {
          polygon: [
            { x: 0, y: 0 },
            { x: 200, y: 0 },
            { x: 200, y: 100 },
            { x: 0, y: 100 },
          ],
        }),
        object(5, "spiel", "clickable", { x: 160, y: 96, width: 16, height: 16 }, [
          property("action", "minigame"),
          property("minigameId", "quiz-01"),
        ]),
        object(6, "bank", "clickable", { x: 200, y: 48, width: 16, height: 16 }, [
          property("label", "Bank"),
        ]),
        tileObject(7, "", "decoration", { x: 96, y: 160, width: 16, height: 16 }, 17),
      ]),
    ],
  );

  // Saal: the banquet hall with seats at two tables and a wander area.
  const saal = tiledMap(
    20,
    14,
    [tileset(1, "boden", 4, 4), tileset(17, "dekor", 4, 2)],
    [
      tiledLayer(
        1,
        "boden",
        20,
        14,
        base64(20, 14, (x, y) => 1 + ((x + y) % 4)),
        "base64",
      ),
      tiledLayer(2, "collision", 20, 14, csv(20, 14, border(20, 14))),
      objectLayer(3, "objekte", [
        point(1, "start", "spawn", 160, 160),
        object(2, "zum-garten", "portal", { x: 0, y: 160, width: 16, height: 32 }, [
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
  );

  // The name of each map is the map property `name`, which the admin area shows (14.4).
  const named = (map: Record<string, unknown>, name: string) => ({
    ...map,
    properties: [property("name", name)],
  });
  return {
    kirche: named(kirche, "Kirche"),
    garten: named(garten, "Garten"),
    saal: named(saal, "Saal"),
  };
}

/** The sprite sheet of an avatar part: 4 × 4 frames of 16 × 24 pixels, drawn in greyscale. */
const sheet = (grey: number) => encodePng(64, 96, [grey, grey, grey]);

/** The files of the test world, by their paths in the archive. */
export function testWorldFiles(): Record<string, Buffer> {
  const files: Record<string, Buffer> = {
    "manifest.json": json({
      kind: "zappaloo-world",
      formatVersion: 1,
      name: TEST_WORLD_NAME,
      startMap: "kirche",
      tileSize: TILE,
    }),
    "tilesets/boden.png": tilesetPng(4, 4, false),
    "tilesets/dekor.png": tilesetPng(4, 2, true),
    "tilesets/objekte.png": tilesetPng(3, 1, false),
    "avatar/avatar.json": json({
      frameWidth: 16,
      frameHeight: 24,
      palettes: {
        skin: ["#f6d7b0", "#e0ac7e", "#a86f4b", "#6b4329"],
        hair: ["#2b1d14", "#7a4a26", "#d8b25a", "#b8b8b8"],
        outfit: ["#3b5b92", "#8e3b46", "#3f7a4f", "#e7e2d4"],
      },
      parts: {
        body: {
          palette: "skin",
          options: [{ id: "base", label: "Standard", file: "body.png", detail: "body-detail.png" }],
        },
        outfit: {
          palette: "outfit",
          options: [
            { id: "suit", label: "Anzug", file: "outfit-suit.png" },
            { id: "kleid", label: "Kleid", file: "outfit-kleid.png" },
          ],
        },
        hair: {
          palette: "hair",
          optional: true,
          options: [
            { id: "kurz", label: "Kurz", file: "hair-kurz.png" },
            { id: "lang", label: "Lang", file: "hair-lang.png" },
          ],
        },
        accessory: {
          optional: true,
          options: [{ id: "brille", label: "Brille", file: "acc-brille.png" }],
        },
      },
      templates: [
        {
          label: "Festlich",
          avatar: {
            body: "base",
            skin: "#e0ac7e",
            outfit: "suit",
            outfitColor: "#3b5b92",
            hair: "kurz",
            hairColor: "#2b1d14",
            accessory: null,
          },
        },
      ],
    }),
    "avatar/body.png": sheet(200),
    "avatar/body-detail.png": sheet(40),
    "avatar/outfit-suit.png": sheet(170),
    "avatar/outfit-kleid.png": sheet(150),
    "avatar/hair-kurz.png": sheet(120),
    "avatar/hair-lang.png": sheet(100),
    "avatar/acc-brille.png": sheet(230),
    "door/door.json": json({
      frameWidth: 32,
      frameHeight: 32,
      frames: 4,
      fps: 4,
      gap: { x: 0.35, y: 0.2, width: 0.3, height: 0.6 },
    }),
    "door/door.png": encodePng(128, 32, [0x8a, 0x5a, 0x3a]),
    "door/door-glimpse.png": encodePng(64, 64, [0xf2, 0xd3, 0x8a]),
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
