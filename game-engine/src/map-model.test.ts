import { describe, expect, it } from "vitest";
import { parseMap } from "./map-model.ts";

/** A 3 × 3 isometric map of 64 × 32 tiles, written the way Tiled exports it. */
function tiledMap(
  extra: {
    layers?: unknown[];
    objects?: unknown[];
    properties?: unknown[];
    tilesets?: Record<string, unknown>[];
  } = {},
) {
  return {
    type: "map",
    orientation: "isometric",
    width: 3,
    height: 3,
    tilewidth: 64,
    tileheight: 32,
    properties: extra.properties ?? [{ name: "name", type: "string", value: "Kirche" }],
    tilesets: extra.tilesets ?? [
      {
        firstgid: 1,
        name: "boden",
        image: "../tilesets/boden.png",
        imagewidth: 256,
        imageheight: 128,
        margin: 0,
        spacing: 0,
        tilewidth: 64,
        tileheight: 32,
        tilecount: 16,
        columns: 4,
      },
      {
        firstgid: 30,
        name: "gebaeude",
        columns: 0,
        tilecount: 2,
        tilewidth: 64,
        tileheight: 32,
        tiles: [
          {
            id: 0,
            image: "../tilesets/haus.png",
            imagewidth: 128,
            imageheight: 96,
            objectgroup: {
              type: "objectgroup",
              name: "",
              objects: [
                {
                  id: 1,
                  name: "collision",
                  x: 0,
                  y: 0,
                  polygon: [
                    { x: 8, y: 80 },
                    { x: 120, y: 80 },
                    { x: 64, y: 60 },
                  ],
                },
                {
                  id: 4,
                  name: "trigger",
                  x: 3,
                  y: 4,
                  polygon: [
                    { x: 0, y: 0 },
                    { x: 8, y: 0 },
                    { x: 8, y: 8 },
                  ],
                },
                {
                  id: 5,
                  name: "occlusion",
                  x: 4,
                  y: 2,
                  polyline: [
                    { x: 20, y: 12 },
                    { x: 108, y: 12 },
                  ],
                },
              ],
            },
          },
          {
            id: 1,
            image: "../tilesets/portal.png",
            imagewidth: 64,
            imageheight: 32,
            objectgroup: {
              type: "objectgroup",
              name: "",
              objects: [
                {
                  id: 3,
                  name: "trigger",
                  x: 0,
                  y: 0,
                  polygon: [
                    { x: 0, y: 0 },
                    { x: 20, y: 0 },
                    { x: 20, y: 20 },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
    layers: extra.layers ?? [
      {
        type: "group",
        name: "Terrain",
        visible: true,
        layers: [
          {
            type: "tilelayer",
            name: "boden",
            visible: true,
            width: 3,
            height: 3,
            data: [1, 2, 3, 4, 0, 0, 0, 0, 0],
          },
        ],
      },
      {
        type: "tilelayer",
        name: "versteckt",
        visible: false,
        width: 3,
        height: 3,
        data: [1, 1, 1, 1, 1, 1, 1, 1, 1],
      },
      {
        type: "tilelayer",
        name: "collision",
        visible: false,
        width: 3,
        height: 3,
        data: [0, 0, 0, 0, 1, 0, 0, 0, 0],
      },
      {
        type: "objectgroup",
        name: "Objekte",
        visible: true,
        objects: extra.objects ?? [
          { id: 10, name: "start", type: "spawn", x: 96, y: 64, point: true, properties: [] },
          {
            id: 11,
            name: "zum-garten",
            type: "portal",
            gid: 31,
            x: 0,
            y: 128,
            width: 64,
            height: 32,
            rotation: 0,
            properties: [
              { name: "targetMap", type: "string", value: "garten" },
              { name: "targetSpawn", type: "string", value: "start" },
            ],
          },
          {
            id: 12,
            name: "",
            type: "decoration",
            gid: 30,
            x: 160,
            y: 160,
            width: 128,
            height: 96,
            rotation: 0,
            properties: [],
          },
          {
            id: 13,
            name: "",
            type: "border",
            x: 0,
            y: 0,
            polygon: [
              { x: 0, y: 0 },
              { x: 50, y: 0 },
              { x: 50, y: 50 },
            ],
            properties: [],
          },
        ],
      },
    ],
  };
}

describe("the map as the game draws it (MAP-02, GAME-19)", () => {
  it("[MAP-02] the ground is drawn from the visible tile layers, group layers read recursively, hidden layers not", () => {
    const map = parseMap("kirche", tiledMap());
    expect(map.ground).toHaveLength(4);
    expect(map.drawnLayers).toBe(1);
    expect(map.name).toBe("Kirche");
  });

  it("[MAP-02] the collision layer blocks its cells and is not drawn", () => {
    const map = parseMap("kirche", tiledMap());
    expect([...map.obstacles.blockedCells]).toEqual(["1,1"]);
    expect(map.ground.every((draw) => draw.image.key === "tileset:boden")).toBe(true);
  });

  it("[MAP-02] the spawn points, the portals and the border are read from the objects", () => {
    const map = parseMap("kirche", tiledMap());
    expect(map.spawns.get("start")).toEqual({ x: 32, y: 80 });
    expect(map.portals).toHaveLength(1);
    expect(map.portals[0]).toMatchObject({
      name: "zum-garten",
      targetMap: "garten",
      targetSpawn: "start",
    });
    // The default isometric alignment is bottom-center, so the 64-pixel portal image extends 32 pixels left.
    const topLeft = { x: -128, y: 32 };
    expect(map.portals[0]?.polygon).toEqual([
      topLeft,
      { x: topLeft.x + 20, y: topLeft.y },
      { x: topLeft.x + 20, y: topLeft.y + 20 },
    ]);
    expect(map.obstacles.borders).toHaveLength(1);
    // The drawn picture of a portal's arrow is found by the Tiled id of its object (GAME-15).
    expect(map.portals[0]?.objectId).toBe(11);
    expect(map.objects.map((draw) => draw.objectId)).toContain(11);
  });

  it("[GAME-05][GAME-08][MAP-03] clickable objects are read with their label, preset, easter-egg flag and approach point", () => {
    const property = (name: string, value: unknown) => ({ name, type: "string", value });
    const map = parseMap(
      "kirche",
      tiledMap({
        objects: [
          { id: 1, name: "start", type: "spawn", x: 96, y: 64, point: true, properties: [] },
          {
            id: 2,
            name: "altar",
            type: "clickable",
            x: 64,
            y: 64,
            width: 32,
            height: 16,
            properties: [
              property("label", "Programm"),
              property("action", "page"),
              property("page", "programme"),
              property("approach", "davor"),
            ],
          },
          { id: 3, name: "davor", x: 128, y: 160, point: true, properties: [] },
          {
            id: 4,
            name: "osterei",
            type: "clickable",
            x: 32,
            y: 32,
            width: 16,
            height: 16,
            properties: [{ name: "hidden", type: "bool", value: true }],
          },
        ],
      }),
    );
    expect(map.clickables.map((item) => item.name)).toEqual(["altar", "osterei"]);
    const [altar, egg] = map.clickables;
    expect(altar).toMatchObject({
      label: "Programm",
      hidden: false,
      preset: { kind: "page", page: "programme" },
    });
    // The named approach point, in the map's pixel space.
    expect(altar?.approach).toEqual({ x: -32, y: 144 });
    expect(egg?.hidden).toBe(true);
    expect(egg?.preset).toBeUndefined();
    // Without an approach point: below the object's bottom edge (14.2).
    const bottom = Math.max(...(egg?.polygon.map((point) => point.y) ?? []));
    expect(egg?.approach.y).toBe(bottom + 16);
  });

  it("[GAME-20] a bottom-aligned tile object shares its image transform with collision and trigger guides", () => {
    const map = parseMap("kirche", tiledMap());
    // The portal is a tile object too; the decoration is the one at (160, 160).
    expect(map.objects).toHaveLength(2);
    const anchor = { x: 0, y: 160 };
    const topLeft = { x: -32, y: 64 };
    const object = map.objects.find((item) => item.x === topLeft.x);
    expect(object).toMatchObject({
      x: topLeft.x,
      y: topLeft.y,
      width: 128,
      height: 96,
      depth: anchor.y,
    });
    expect(map.obstacles.solids).toHaveLength(1);
    expect(map.obstacles.solids[0]?.[0]).toEqual({ x: topLeft.x + 8, y: topLeft.y + 80 });
    expect(map.occluders).toEqual([
      {
        depth: anchor.y,
        line: [
          { x: topLeft.x + 24, y: topLeft.y + 14 },
          { x: topLeft.x + 112, y: topLeft.y + 14 },
        ],
        // The picture of the object, which decides whether a figure overlaps it (GAME-19).
        bounds: { x: topLeft.x, y: topLeft.y, width: 128, height: 96 },
      },
    ]);
  });

  it("[GAME-20] an oversized collection tile uses its cell's bottom edge", () => {
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: [30, 0, 0, 0, 0, 0, 0, 0, 0],
        encoding: "csv",
      },
    ];
    const map = parseMap("kirche", tiledMap({ layers }));
    expect(map.ground[0]).toMatchObject({
      x: 0,
      y: -64,
      width: 128,
      height: 96,
    });
  });

  it("[GAME-35] an animated collection tile lists the textures and durations of its frames; a still tile has none", () => {
    const base = tiledMap();
    const tilesets = base.tilesets.map((set) =>
      set.name === "gebaeude"
        ? {
            ...set,
            tiles: [
              {
                id: 0,
                image: "../tilesets/brunnen-1.png",
                imagewidth: 32,
                imageheight: 32,
                animation: [
                  { tileid: 0, duration: 150 },
                  { tileid: 1, duration: 250 },
                ],
              },
              { id: 1, image: "../tilesets/brunnen-2.png", imagewidth: 32, imageheight: 32 },
              { id: 2, image: "../tilesets/stein.png", imagewidth: 32, imageheight: 32 },
            ],
          }
        : set,
    );
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: [30, 31, 32, 0, 0, 0, 0, 0, 0],
        encoding: "csv",
      },
    ];
    const map = parseMap("kirche", tiledMap({ layers, tilesets }));
    expect(map.ground[0]?.image.animation).toEqual([
      { key: "tileset:brunnen-1", duration: 150 },
      { key: "tileset:brunnen-2", duration: 250 },
    ]);
    expect(map.ground[1]?.image.animation).toBeUndefined();
    expect(map.ground[2]?.image.animation).toBeUndefined();
  });

  it("[GAME-20] sheet crops derive columns from dimensions and include margin and spacing", () => {
    const base = tiledMap();
    const tilesets = base.tilesets.map((set, index) =>
      index === 0 ? { ...set, margin: 2, spacing: 3, imagewidth: 271, imageheight: 143 } : set,
    );
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: [1, 2, 0, 0, 0, 0, 0, 0, 0],
        encoding: "csv",
      },
    ];
    const map = parseMap("kirche", tiledMap({ layers, tilesets }));
    expect(map.ground[0]?.image.crop).toEqual({ x: 2, y: 2, width: 64, height: 32 });
    expect(map.ground[1]?.image.crop).toEqual({ x: 69, y: 2, width: 64, height: 32 });
  });

  it("[GAME-20] a sheet with per-tile properties from Tiled still takes its tiles from the sheet", () => {
    const base = tiledMap();
    const tilesets = base.tilesets.map((set, index) =>
      index === 0
        ? {
            ...set,
            tiles: [{ id: 1, properties: [{ name: "kind", type: "string", value: "wand" }] }],
          }
        : set,
    );
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        encoding: "csv",
      },
    ];
    const map = parseMap("kirche", tiledMap({ layers, tilesets }));
    expect(map.ground[0]?.image.crop).toEqual({ x: 64, y: 0, width: 64, height: 32 });
  });

  it("[MAP-02] the tiles of a Base64 layer are read like the array of a CSV layer", () => {
    const values = [1, 2, 3, 4, 0, 0, 0, 0, 0];
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    values.forEach((value, index) => {
      view.setUint32(index * 4, value, true);
    });
    const base64 = btoa(bytes.reduce((binary, byte) => binary + String.fromCharCode(byte), ""));
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: base64,
        encoding: "base64",
      },
    ];
    expect(parseMap("kirche", tiledMap({ layers })).ground).toHaveLength(4);
  });
});
