import { describe, expect, it } from "vitest";
import { parseMap } from "./map-model.ts";

/** A 3 × 3 isometric map of 64 × 32 tiles, written the way Tiled exports it. */
function tiledMap(extra: { layers?: unknown[]; objects?: unknown[]; properties?: unknown[] } = {}) {
  return {
    type: "map",
    orientation: "isometric",
    width: 3,
    height: 3,
    tilewidth: 64,
    tileheight: 32,
    properties: extra.properties ?? [{ name: "name", type: "string", value: "Kirche" }],
    tilesets: [
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
        tilecount: 1,
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
                  id: 2,
                  name: "occlusion",
                  x: 0,
                  y: 0,
                  polyline: [
                    { x: 0, y: 72 },
                    { x: 128, y: 72 },
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
            x: 0,
            y: 128,
            width: 32,
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
    expect(map.spawns.get("start")).toEqual({ x: 96, y: 64 });
    expect(map.portals).toHaveLength(1);
    expect(map.portals[0]).toMatchObject({
      name: "zum-garten",
      targetMap: "garten",
      targetSpawn: "start",
    });
    expect(map.obstacles.borders).toHaveLength(1);
  });

  it("[GAME-19] a tile object is drawn with its bottom-left corner at its position, with its occlusion line and collision", () => {
    const map = parseMap("kirche", tiledMap());
    expect(map.objects).toHaveLength(1);
    const object = map.objects[0];
    expect(object).toMatchObject({ x: 160, y: 64, width: 128, height: 96, depth: 160 });
    expect(map.occluders).toHaveLength(1);
    expect(map.occluders[0]?.depth).toBe(160);
    expect(map.occluders[0]?.line).toEqual([
      { x: 160, y: 136 },
      { x: 288, y: 136 },
    ]);
    expect(map.obstacles.solids).toHaveLength(1);
    expect(map.obstacles.solids[0]?.[0]).toEqual({ x: 168, y: 144 });
  });

  it("[MAP-02] the tiles of a Base64 layer are read like the array of a CSV layer", () => {
    const values = [1, 2, 3, 4, 0, 0, 0, 0, 0];
    const bytes = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => bytes.writeUInt32LE(value, index * 4));
    const layers = [
      {
        type: "tilelayer",
        name: "boden",
        visible: true,
        width: 3,
        height: 3,
        data: bytes.toString("base64"),
        encoding: "base64",
      },
    ];
    expect(parseMap("kirche", tiledMap({ layers })).ground).toHaveLength(4);
  });
});
