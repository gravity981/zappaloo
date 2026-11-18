import { describe, expect, it } from "vitest";
import { prepareWorld } from "./world-data.ts";

const directions = ["south", "west", "east", "north"] as const;

describe("preparing world input (MAP-10, AVA-02)", () => {
  it("[MAP-10] prepares maps and resolves all figure textures through the host", () => {
    const summary = {
      version: "import-1",
      name: "Test world",
      startMap: "courtyard",
      tileWidth: 64,
      tileHeight: 32,
      maps: ["courtyard"],
      figures: [{ id: "guest", type: "other", tier: "tier1", metadata: "guests/metadata.json" }],
    };
    const map = {
      type: "map",
      orientation: "isometric",
      width: 1,
      height: 1,
      tilewidth: 64,
      tileheight: 32,
      layers: [],
      tilesets: [],
    };
    const metadata = {
      states: [
        {
          character: { size: { width: 16, height: 24 } },
          frames: {
            rotations: Object.fromEntries(
              directions.map((direction) => [direction, `${direction}.png`]),
            ),
            animations: {
              walking: Object.fromEntries(
                directions.map((direction) => [direction, [`walk-${direction}.png`]]),
              ),
            },
          },
        },
      ],
    };

    const world = prepareWorld({
      summary,
      maps: new Map([["courtyard", map]]),
      figureMetadata: new Map([["guests/metadata.json", metadata]]),
      resolveAsset: (path) => `/preview/${path}`,
    });

    expect(world.maps.has("courtyard")).toBe(true);
    expect(world.figures[0]?.size).toEqual({ width: 16, height: 24 });
    expect(world.images.get("frame:guest:south.png")).toBe("/preview/avatar/guests/south.png");
    expect(world.images.get("frame:guest:walk-south.png")).toBe(
      "/preview/avatar/guests/walk-south.png",
    );
  });

  it("[GAME-35] loads the pictures of the frames of a tile animation, not only the tile's own", () => {
    const map = {
      type: "map",
      orientation: "isometric",
      width: 1,
      height: 1,
      tilewidth: 64,
      tileheight: 32,
      layers: [
        {
          type: "tilelayer",
          name: "boden",
          visible: true,
          width: 1,
          height: 1,
          data: [1],
          encoding: "csv",
        },
      ],
      tilesets: [
        {
          firstgid: 1,
          name: "gebaeude",
          columns: 0,
          tilecount: 2,
          tilewidth: 64,
          tileheight: 32,
          tiles: [
            {
              id: 0,
              image: "../tilesets/brunnen-1.png",
              imagewidth: 32,
              imageheight: 32,
              animation: [
                { tileid: 0, duration: 100 },
                { tileid: 1, duration: 100 },
              ],
            },
            { id: 1, image: "../tilesets/brunnen-2.png", imagewidth: 32, imageheight: 32 },
          ],
        },
      ],
    };
    const world = prepareWorld({
      summary: {
        version: "import-1",
        name: "Test world",
        startMap: "courtyard",
        tileWidth: 64,
        tileHeight: 32,
        maps: ["courtyard"],
        figures: [],
      },
      maps: new Map([["courtyard", map]]),
      figureMetadata: new Map(),
      resolveAsset: (path) => `/preview/${path}`,
    });
    expect(world.images.get("tileset:brunnen-1")).toBe("/preview/tilesets/brunnen-1.png");
    expect(world.images.get("tileset:brunnen-2")).toBe("/preview/tilesets/brunnen-2.png");
  });
});
