import { describe, expect, it } from "vitest";
import { prepareWorld } from "./world-data.ts";

const directions = ["south", "west", "east", "north"] as const;

describe("preparing world input (MAP-10, AVA-02)", () => {
  it("[MAP-10][AVA-02] prepares maps and resolves all figure textures through the host", () => {
    const summary = {
      version: "import-1",
      name: "Test world",
      startMap: "courtyard",
      tileWidth: 64,
      tileHeight: 32,
      maps: ["courtyard"],
      figures: [{ id: "guest", metadata: "guests/metadata.json" }],
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
});
