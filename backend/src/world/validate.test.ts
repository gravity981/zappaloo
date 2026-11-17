import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { WORLD_LIMITS } from "@zappaloo/shared";
import { buildArchive, encodePng } from "../packages/build.ts";
import { buildTestWorld, testWorldFiles } from "./build.ts";
import { checkWorldPackage } from "./validate.ts";
import type { WorldFinding } from "./findings.ts";

type Json = Record<string, unknown>;
type Files = Record<string, Buffer>;

const json = (value: unknown): Buffer => Buffer.from(JSON.stringify(value));
const MB = 1024 * 1024;

/** A world package that passes every rule; each test changes one part of it. */
const world = (): Files => testWorldFiles();
const archive = (files: Files): Buffer => buildArchive(files);

function read(files: Files, path: string): Json {
  return JSON.parse((files[path] ?? Buffer.alloc(0)).toString("utf8")) as Json;
}

/** Changes one JSON file of the package in place. */
function edit(files: Files, path: string, change: (value: Json) => void): Files {
  const value = read(files, path);
  change(value);
  files[path] = json(value);
  return files;
}

/** Every object of a map's object layers, groups included. */
function allObjects(layers: Json[]): Json[] {
  return layers.flatMap((layer) => {
    if (layer.type === "group") return allObjects(layer.layers as Json[]);
    return (layer.objects as Json[] | undefined) ?? [];
  });
}

/** The layers of a map, groups included, in the order of the file. */
function allLayers(layers: Json[]): Json[] {
  return layers.flatMap((layer) => {
    if (layer.type === "group") return allLayers(layer.layers as Json[]);
    return [layer];
  });
}

/** The layer of a map with a name, groups included. */
function layerNamed(map: Json, name: string): Json {
  const found = allLayers(map.layers as Json[]).find((layer) => layer.name === name);
  if (found === undefined) throw new Error(`no layer ${name}`);
  return found;
}

/** The tileset of a map with a name. */
function tilesetNamed(map: Json, name: string): Json {
  const found = (map.tilesets as Json[]).find((set) => set.name === name);
  if (found === undefined) throw new Error(`no tileset ${name}`);
  return found;
}

/** The tileset of a map at an index, in the order of the file. */
function tilesetAt(map: Json, index: number): Json {
  const found = (map.tilesets as Json[])[index];
  if (found === undefined) throw new Error(`no tileset ${String(index)}`);
  return found;
}

/** The tile of a collection tileset at an index. */
function tileAt(set: Json, index: number): Json {
  const found = (set.tiles as Json[])[index];
  if (found === undefined) throw new Error(`no tile ${String(index)}`);
  return found;
}

/** The first object of a map with a type, any object layer. */
function objectOfType(map: Json, type: string): Json {
  const found = allObjects(map.layers as Json[]).find((object) => object.type === type);
  if (found === undefined) throw new Error(`no object of type ${type}`);
  return found;
}

/** The object of a map with a name (any object layer). */
function objectNamed(map: Json, name: string): Json {
  const found = allObjects(map.layers as Json[]).find((object) => object.name === name);
  if (found === undefined) throw new Error(`no object ${name}`);
  return found;
}

/** Sets the map property `name`. */
function setMapName(map: Json, name: unknown): void {
  map.properties = [{ name: "name", type: "string", value: name }];
}

/** Sets a custom property of an object, replacing its value or adding it. */
function setProperty(object: Json, name: string, value: unknown, type = "string"): void {
  const properties = (object.properties ?? []) as Json[];
  const found = properties.find((property) => property.name === name);
  if (found) {
    found.value = value;
    found.type = type;
  } else properties.push({ name, type, value });
  object.properties = properties;
}

function removeProperty(object: Json, name: string): void {
  object.properties = ((object.properties ?? []) as Json[]).filter(
    (property) => property.name !== name,
  );
}

/** The codes of the findings of one severity. */
function codes(findings: WorldFinding[], severity: WorldFinding["severity"] = "error"): string[] {
  return findings.filter((finding) => finding.severity === severity).map((finding) => finding.code);
}

/** Checks the package and expects it refused with the given error code. */
function expectRefused(files: Files, code: string): WorldFinding[] {
  const result = checkWorldPackage(archive(files));
  expect(result.ok).toBe(false);
  expect(codes(result.findings)).toContain(code);
  return result.findings;
}

/** Checks the package and expects it accepted with no error (warnings are allowed). */
function expectAccepted(files: Files): WorldFinding[] {
  const result = checkWorldPackage(archive(files));
  expect(codes(result.findings), JSON.stringify(result.findings)).toEqual([]);
  expect(result.ok).toBe(true);
  return result.findings;
}

/** Sets the type byte of the first entry of a tar archive and recomputes its checksum. */
function withEntryType(gzipped: Buffer, type: string): Buffer {
  const tar = gunzipSync(gzipped);
  const header = tar.subarray(0, 512);
  header.write(type, 156, 1, "latin1");
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return gzipSync(tar);
}

/** The test world's figure `wedding-guest`, with its metadata edited. */
function editMetadata(files: Files, figure: string, change: (metadata: Json) => void): Files {
  return edit(files, `avatar/${figure}/metadata.json`, (metadata) => {
    change((metadata.states as Json[])[0] ?? {});
  });
}

describe("the test world", () => {
  it("[MAP-06] the generated test world passes every rule without a finding", () => {
    const result = checkWorldPackage(buildTestWorld());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    if (result.ok) expect(result.package.mapIds.sort()).toEqual(["garten", "kirche", "saal"]);
  });

  it("[MAP-06][MAP-16] the package has its door scene and two figures", () => {
    const result = checkWorldPackage(buildTestWorld());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package.door?.sheet.frames).toBe(4);
    expect(result.package.door?.glimpse).toBe(true);
    expect(result.package.figures.map((figure) => figure.id)).toEqual([
      "wedding-guest",
      "male-guest",
    ]);
    expect(result.package.manifest.startMap).toBe("kirche");
    expect(result.package.manifest.tileWidth).toBe(64);
    expect(result.package.manifest.tileHeight).toBe(32);
  });
});

describe("the archive and the layout (MAP-16)", () => {
  it("[MAP-16] refuses an archive of more than 40 MB", () => {
    const result = checkWorldPackage(Buffer.alloc(WORLD_LIMITS.archiveBytes + 1));
    expect(codes(result.findings)).toEqual(["archive_too_large"]);
  });

  it("[MAP-16] refuses an archive that unpacks to more than 100 MB", () => {
    const files = world();
    for (let index = 0; index < 21; index++) {
      files[`tilesets/filler-${String(index)}.png`] = Buffer.alloc(5 * MB);
    }
    expectRefused(files, "unpacked_too_large");
  });

  it("[MAP-16] refuses an archive with more than 3000 files and folders", () => {
    const files = world();
    for (let index = 0; index < 3001; index++) {
      files[`tilesets/many-${String(index)}.png`] = Buffer.from("x");
    }
    expectRefused(files, "too_many_files");
  });

  it("[MAP-16] refuses a link in the archive", () => {
    const refused = checkWorldPackage(withEntryType(archive(world()), "2"));
    expect(codes(refused.findings)).toContain("entry_type");
  });

  it("[MAP-16] refuses a path with .. or an absolute path", () => {
    const files = world();
    files["../escape.json"] = json({});
    expectRefused(files, "entry_path");
  });

  it("[MAP-16] refuses a file the layout does not name", () => {
    const files = world();
    files["notes.txt"] = Buffer.from("hello");
    expectRefused(files, "file_not_in_layout");
  });

  it("[MAP-16] refuses a Tiled tileset file, which the package does not take", () => {
    const files = world();
    files["tilesets/boden.tsx"] = Buffer.from("<tileset/>");
    expectRefused(files, "file_not_in_layout");
  });

  it("[MAP-16] refuses a package without its manifest", () => {
    const files = world();
    delete files["manifest.json"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-16] refuses a package without any map", () => {
    const files = world();
    const withoutMaps = Object.fromEntries(
      Object.entries(files).filter(([path]) => !path.startsWith("maps/")),
    );
    expectRefused(withoutMaps, "file_missing");
  });

  it("[MAP-16] refuses a JSON file that is not valid JSON", () => {
    const files = world();
    files["avatar/figures.json"] = Buffer.from("{");
    expectRefused(files, "json_invalid");
  });

  it("[MAP-16] refuses a JSON file of more than 5 MB", () => {
    const files = world();
    files["door/door.json"] = Buffer.alloc(WORLD_LIMITS.jsonBytes + 1, 0x20);
    expectRefused(files, "json_too_large");
  });

  it("[MAP-16] refuses a PNG file of more than 8 MB", () => {
    const files = world();
    files["tilesets/boden.png"] = Buffer.concat([
      encodePng(16, 16, [0, 0, 0]),
      Buffer.alloc(WORLD_LIMITS.imageBytes + 1),
    ]);
    expectRefused(files, "file_too_large");
  });

  it("[MAP-16] refuses a file that is not a PNG where a PNG belongs", () => {
    const files = world();
    files["tilesets/boden.png"] = Buffer.from("not a picture");
    expectRefused(files, "image_not_png");
  });

  it("[MAP-16] refuses a PNG of more than 4096 pixels a side", () => {
    const files = world();
    files["tilesets/boden.png"] = encodePng(WORLD_LIMITS.imageSide + 1, 1, [0, 0, 0]);
    expectRefused(files, "image_size");
  });
});

describe("the manifest (MAP-06, MAP-16)", () => {
  it("[MAP-16] refuses a format version the platform does not read", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.formatVersion = 1;
    });
    expectRefused(files, "format_version");
  });

  it("[MAP-06] refuses a manifest with the old field tileSize", () => {
    const files = edit(world(), "manifest.json", (m) => {
      delete m.tileWidth;
      delete m.tileHeight;
      m.tileSize = 64;
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] refuses a manifest with an unknown field", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.extra = true;
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] refuses a kind that is not zappaloo-world", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.kind = "zappaloo-theme";
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] refuses a tile width outside 8–128", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.tileWidth = 4;
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] refuses a start map that is not in the package", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.startMap = "nirgendwo";
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] accepts $schema, which only names the schema for editors", () => {
    const files = edit(world(), "manifest.json", (m) => {
      m.$schema = "https://example.org/world-manifest.v2.schema.json";
    });
    expectAccepted(files);
  });
});

describe("the maps: format and layers (MAP-02, MAP-06)", () => {
  it("[MAP-06] refuses a map id that is not 1–40 characters of a–z, 0–9 and -", () => {
    const files = world();
    files["maps/Big_Map.json"] = files["maps/saal.json"] ?? Buffer.alloc(0);
    expectRefused(files, "map_id");
  });

  it("[MAP-06] accepts a map name of 1–60 characters, and a map without a name", () => {
    expectAccepted(
      edit(world(), "maps/saal.json", (m) => {
        setMapName(m, "Saal, 60 Zeichen");
      }),
    );
    const unnamed = edit(world(), "maps/saal.json", (m) => {
      m.properties = [];
    });
    expectAccepted(unnamed);
  });

  it("[MAP-06] refuses a map name of more than 60 characters", () => {
    expectRefused(
      edit(world(), "maps/saal.json", (m) => {
        setMapName(m, "x".repeat(61));
      }),
      "map_property",
    );
  });

  it("[MAP-06] refuses a map that is not valid JSON", () => {
    const files = world();
    files["maps/saal.json"] = Buffer.from("{");
    expectRefused(files, "json_invalid");
  });

  it("[MAP-06] refuses a map that is not isometric", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.orientation = "orthogonal";
    });
    expectRefused(files, "map_format");
  });

  it("[MAP-06] refuses an infinite map", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.infinite = true;
    });
    expectRefused(files, "map_format");
  });

  it.each([
    ["renderorder", (m: Json) => (m.renderorder = "left-down")],
    ["parallax origin", (m: Json) => (m.parallaxoriginx = 12)],
  ])("[MAP-06][GAME-20] refuses unsupported map %s", (_setting, change) => {
    const files = edit(world(), "maps/saal.json", change);
    expectRefused(files, "map_format");
  });

  it.each([
    ["x", (layer: Json) => (layer.x = 1)],
    ["y", (layer: Json) => (layer.y = 1)],
    ["offsetx", (layer: Json) => (layer.offsetx = 1)],
    ["offsety", (layer: Json) => (layer.offsety = 1)],
    ["opacity", (layer: Json) => (layer.opacity = 0.5)],
    ["tintcolor", (layer: Json) => (layer.tintcolor = "#ff0000")],
    ["parallaxx", (layer: Json) => (layer.parallaxx = 0.5)],
    ["parallaxy", (layer: Json) => (layer.parallaxy = 0.5)],
    ["blendmode", (layer: Json) => (layer.blendmode = "multiply")],
    ["repeatx", (layer: Json) => (layer.repeatx = true)],
  ])("[MAP-06][GAME-20] refuses non-default layer %s", (_setting, change) => {
    const files = edit(world(), "maps/kirche.json", (m) => change(layerNamed(m, "boden")));
    expectRefused(files, "map_layer");
  });

  it("[MAP-06][GAME-20] refuses a hidden group because visibility is inherited", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const group = (m.layers as Json[]).find((layer) => layer.type === "group");
      if (group === undefined) throw new Error("no group layer");
      group.visible = false;
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06][GAME-20] refuses index draw order on an object layer", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const layer = allLayers(m.layers as Json[]).find((item) => item.type === "objectgroup");
      if (layer === undefined) throw new Error("no object layer");
      layer.draworder = "index";
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06][GAME-20] refuses an individually hidden map object", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      objectNamed(m, "altar").visible = false;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06][GAME-20] refuses unsupported tile-object alignment", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      tilesetNamed(m, "gebaeude").objectalignment = "center";
    });
    expectRefused(files, "map_tileset");
  });

  it.each(["bottom", undefined])(
    "[MAP-06][GAME-20] accepts bottom objectalignment %s and a zero tile offset",
    (alignment) => {
      const files = edit(world(), "maps/kirche.json", (m) => {
        const tileset = tilesetNamed(m, "gebaeude");
        if (alignment === undefined) delete tileset.objectalignment;
        else tileset.objectalignment = alignment;
        tileset.tileoffset = { x: 0, y: 0 };
      });
      expectAccepted(files);
    },
  );

  it("[MAP-06][GAME-20] refuses bottom-left alignment for tile objects", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      tilesetNamed(m, "gebaeude").objectalignment = "bottomleft";
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06][GAME-20] refuses non-zero tileset offsets", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      tilesetNamed(m, "gebaeude").tileoffset = { x: 7.5, y: -3 };
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06][GAME-20] refuses scaled tile objects", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      objectNamed(m, "altar").width = 32;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06][GAME-20] refuses animated tiles", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      tileAt(tilesetNamed(m, "gebaeude"), 0).animation = [
        {
          tileid: 0,
          duration: 100,
        },
      ];
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06][GAME-20] refuses flipped or rotated tiles in a tile layer", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const layer = layerNamed(m, "boden");
      if (Array.isArray(layer.data)) {
        layer.data[0] = 0x80000001;
      } else if (typeof layer.data === "string") {
        const data = Buffer.from(layer.data, "base64");
        data.writeUInt32LE(0x80000001);
        layer.data = data.toString("base64");
      } else {
        throw new Error("the layer has no tile data");
      }
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses tiles that are not of the package's tile size", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.tilewidth = 32;
    });
    expectRefused(files, "map_format");
  });

  it("[MAP-06] refuses a map larger than 200 × 200 tiles", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.width = 201;
    });
    expectRefused(files, "map_format");
  });

  it("[MAP-06] refuses an image layer", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      (m.layers as Json[]).push({
        type: "imagelayer",
        name: "bild",
        id: 99,
        visible: true,
        image: "x.png",
      });
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] reads group layers recursively, in the order of the file", () => {
    const result = checkWorldPackage(buildTestWorld());
    expect(result.ok).toBe(true);
    const kirche = read(testWorldFiles(), "maps/kirche.json");
    expect((kirche.layers as Json[]).some((layer) => layer.type === "group")).toBe(true);
  });

  it("[MAP-06] refuses a group that holds an image layer", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const group = (m.layers as Json[]).find((layer) => layer.name === "Terrain");
      if (group === undefined) throw new Error("no group Terrain");
      (group.layers as Json[]).push({ type: "imagelayer", name: "bild", id: 99, visible: true });
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses compressed tile data", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      const layer = layerNamed(m, "boden");
      layer.compression = "zlib";
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a map without a tile layer besides collision", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      m.layers = (m.layers as Json[]).filter((layer) => layer.name !== "boden");
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a layer that does not hold the tiles of the map", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const layer = layerNamed(m, "boden");
      layer.data = [1, 2, 3];
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a Base64 layer that is not whole tile ids", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      const layer = layerNamed(m, "boden");
      layer.data = Buffer.alloc(3).toString("base64");
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a tile id that no tileset holds", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const layer = layerNamed(m, "boden");
      (layer.data as number[])[0] = 999;
    });
    expectRefused(files, "map_tiles");
  });
});

describe("the maps: tilesets (MAP-02, MAP-06)", () => {
  it("[MAP-06] refuses an external tileset", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      (m.tilesets as Json[])[0] = {
        firstgid: 1,
        name: "boden",
        source: "boden.tsx",
        tilewidth: 64,
        tileheight: 32,
      };
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses an image that is not in tilesets/", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      tilesetAt(m, 0).image = "boden.png";
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a tileset image that is missing from the package", () => {
    const files = world();
    delete files["tilesets/dekor.png"];
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a sheet image that is not a whole number of tiles", () => {
    const files = world();
    files["tilesets/dekor.png"] = encodePng(70, 32, [0, 0, 0]);
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a tileset whose tiles are not of the package's tile size", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      tilesetAt(m, 0).tilewidth = 32;
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses overlapping tile ids of two tilesets", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      tilesetAt(m, 1).firstgid = 2;
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses an image-collection tile whose image is not in tilesets/", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const collection = tilesetNamed(m, "gebaeude");
      tileAt(collection, 0).image = "haus.png";
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses an image-collection tile whose declared size is not its PNG", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const collection = tilesetNamed(m, "gebaeude");
      tileAt(collection, 0).imagewidth = 64;
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] accepts an image collection with gaps in its tile ids", () => {
    expectAccepted(world());
  });
});

describe("the objects (MAP-02, MAP-06)", () => {
  it("[MAP-06] refuses a map without its spawn point start", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const layer = layerNamed(m, "Gameplay");
      layer.objects = (layer.objects as Json[]).filter((object) => object.name !== "start");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an object type that is not known", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "tanzflaeche").type = "bühne";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an untyped object that is not a point", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      const layer = layerNamed(m, "Gameplay");
      (layer.objects as Json[]).push({
        id: 900,
        name: "ohne",
        x: 1,
        y: 1,
        width: 8,
        height: 8,
        rotation: 0,
        visible: true,
      });
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an object of a shape its type does not take", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "platz-1").point = undefined;
      objectNamed(m, "platz-1").polygon = [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ];
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an ellipse", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "tanzflaeche").ellipse = true;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a border that is not a polygon", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const object = objectOfType(m, "border");
      delete object.polygon;
      object.width = 10;
      object.height = 10;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] accepts collision and border polygons", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const layer = layerNamed(m, "Gameplay");
      (layer.objects as Json[]).push({
        id: 901,
        type: "collision",
        name: "",
        x: 200,
        y: 40,
        rotation: 0,
        visible: true,
        polygon: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 20, y: 30 },
        ],
      });
    });
    expectAccepted(files);
  });

  it("[MAP-06] refuses a rotated object", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      objectNamed(m, "altar").rotation = 90;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a flipped tile object", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const altar = objectNamed(m, "altar");
      altar.gid = (altar.gid as number) + 0x80000000; // Tiled stores the flip bits as an unsigned value
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a name that is used twice among the spawn points, portals and clickable objects", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "sprecher").name = "start";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a clickable object without a valid name", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "sprecher").name = "Sprecher";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a portal that is a rectangle: a portal is a tile object (14.2)", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const portal = objectNamed(m, "zum-garten");
      delete portal.gid;
      portal.width = 64;
      portal.height = 32;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a portal whose tile has no trigger polygon", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      objectNamed(m, "zum-garten").gid = 25;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] accepts a trigger area that is a rectangle, as well as a polygon", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const portals = tilesetNamed(m, "portale");
      const group = (tileAt(portals, 0).objectgroup as Json).objects as Json[];
      group[0] = { id: 1, name: "trigger", x: 0, y: 0, width: 64, height: 32 };
    });
    expectAccepted(files);
  });

  it("[MAP-06] refuses a tile with two trigger polygons", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const portals = tilesetNamed(m, "portale");
      const tile = tileAt(portals, 0);
      const group = (tile.objectgroup as Json).objects as Json[];
      group.push({
        id: 2,
        name: "trigger",
        x: 0,
        y: 0,
        polygon: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 0, y: 4 },
        ],
      });
    });
    expectRefused(files, "map_guide");
  });

  it("[MAP-06] refuses a portal without a name", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      objectNamed(m, "zum-garten").name = "";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] a marker property is no longer used: a portal's tile is its arrow, so the property is a warning", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "zum-garten"), "marker", 9, "object");
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("property_unknown");
  });

  it("[MAP-08] a portal without target is a warning: it does nothing yet, and the package imports", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      const portal = objectNamed(m, "zum-garten");
      removeProperty(portal, "targetMap");
      removeProperty(portal, "targetSpawn");
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("portal_no_target");
  });

  it("[MAP-06] refuses a portal with a target map but no target spawn", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      removeProperty(objectNamed(m, "zum-garten"), "targetSpawn");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-08] refuses a portal whose target map is not in the package", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      setProperty(objectNamed(m, "zum-garten"), "targetMap", "nirgendwo");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an approach point that is not a point without a type", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "schild"), "approach", "pastor");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an action that is not page, content, dialog or minigame", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "action", "tanz");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses an action page without its page", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      removeProperty(objectNamed(m, "altar"), "page");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a page that is neither built in nor a content page", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "page", "einladung");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] accepts a content page as p/<slug>", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "page", "p/anreise");
    });
    expectAccepted(files);
  });

  it("[MAP-06] refuses a dialogue action without its contentId", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      removeProperty(objectNamed(m, "pastor"), "contentId");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a minigame action without its minigameId", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      removeProperty(objectNamed(m, "spiel"), "minigameId");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a label of more than 40 characters", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "label", "x".repeat(41));
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a hidden flag that is not true or false", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "osterei"), "hidden", "ja");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a seat without its table", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      removeProperty(objectNamed(m, "platz-1"), "table");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] accepts a table given as a number, as Tiled's int property", () => {
    expectAccepted(world());
  });

  it("[MAP-06] a hidden layer still applies its objects: a collision in it counts as collision", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      // The Gameplay layer is hidden, its wander area and portals still apply; a collision polygon too.
      const layer = layerNamed(m, "Gameplay");
      layer.visible = false;
      (layer.objects as Json[]).push({
        id: 902,
        type: "collision",
        name: "",
        x: 10,
        y: 10,
        rotation: 0,
        visible: true,
        polygon: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 9 },
        ],
      });
      // The tile collision layer is removed, so only the hidden collision object blocks.
      m.layers = (m.layers as Json[]).filter((item) => item.name !== "collision");
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).not.toContain("map_collision");
  });
});

describe("tile guides: collision and trigger (MAP-02)", () => {
  it("[MAP-02][MAP-06] refuses a guide of a tile that is not a collision or trigger shape", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const collection = tilesetNamed(m, "gebaeude");
      tileAt(collection, 0).objectgroup = {
        type: "objectgroup",
        name: "",
        objects: [
          {
            id: 1,
            name: "licht",
            x: 0,
            y: 0,
            polyline: [
              { x: 0, y: 0 },
              { x: 5, y: 5 },
            ],
          },
        ],
      };
    });
    expectRefused(files, "map_guide");
  });

  it("[MAP-02][MAP-06] refuses image-local occlusion guides", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const collection = tilesetNamed(m, "gebaeude");
      const tile = tileAt(collection, 0);
      tile.objectgroup = {
        type: "objectgroup",
        name: "",
        objects: [
          {
            id: 3,
            name: "occlusion",
            x: 0,
            y: 0,
            polyline: [
              { x: 0, y: 0 },
              { x: 5, y: 5 },
            ],
          },
        ],
      };
    });
    expectRefused(files, "map_guide");
  });

  it("[MAP-02][MAP-06] a placed tile with a collision guide makes the map collide, without any other collision", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      m.layers = (m.layers as Json[]).filter((item) => item.name !== "collision");
      const groups = (m.layers as Json[]).filter((item) => item.type === "group");
      for (const group of groups) {
        group.layers = (group.layers as Json[]).map((item) =>
          item.type === "objectgroup"
            ? {
                ...item,
                objects: (item.objects as Json[]).filter(
                  (object) => object.type !== "collision" && object.type !== "border",
                ),
              }
            : item,
        );
      }
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).not.toContain("map_collision");
  });
});

describe("warnings (MAP-08): listed, the package is still accepted", () => {
  it("[MAP-06] a property the type does not use is a warning", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "contentID", "anreise");
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("property_unknown");
  });

  it("[MAP-06] the camera zoom is fixed at 2: a cameraZoom on a map is a warning and not read", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.properties = [
        ...((m.properties as Json[] | undefined) ?? []),
        { name: "cameraZoom", type: "float", value: 3 },
      ];
    });
    const findings = expectAccepted(files);
    expect(findings.some((finding) => finding.detail.includes("fixed at 2"))).toBe(true);
  });

  it("[MAP-06] a map property such as programItem is a warning", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.properties = [
        ...((m.properties as Json[] | undefined) ?? []),
        { name: "programItem", type: "string", value: "x" },
      ];
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("property_unknown");
  });

  it("[MAP-06] a map without collisions is a warning", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      m.layers = (m.layers as Json[]).filter((layer) => layer.name !== "collision");
      const objects = layerNamed(m, "Gameplay");
      objects.objects = (objects.objects as Json[]).filter(
        (object) => object.type !== "wander" && object.type !== "collision",
      );
    });
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("map_collision");
  });

  it("[MAP-08] a PNG in tilesets/ that no map uses is a warning", () => {
    const files = world();
    files["tilesets/unused.png"] = encodePng(64, 32, [0, 0, 0]);
    const findings = expectAccepted(files);
    expect(codes(findings, "warning")).toContain("tileset_unused");
  });
});

describe("the figures (AVA-01, AVA-02, MAP-16)", () => {
  it("[MAP-06] refuses a package without avatar/figures.json", () => {
    const files = world();
    delete files["avatar/figures.json"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses figures.json with an unknown field", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      f.extra = true;
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] refuses two figures with the same id", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      (f.figures as Json[])[1] = { id: "wedding-guest", metadata: "male-guest/metadata.json" };
    });
    expectRefused(files, "figure_list");
  });

  it("[MAP-06] refuses more than 50 figures", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      f.figures = Array.from({ length: 51 }, (_, index) => ({
        id: `figur-${String(index)}`,
        metadata: "male-guest/metadata.json",
      }));
    });
    expectRefused(files, "figure_list");
  });

  it("[MAP-06] refuses a world without any figure", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      f.figures = [];
    });
    expectRefused(files, "figure_list");
  });

  it("[MAP-06] refuses a figure id that is not 1–40 characters of a–z, 0–9 and -", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      (f.figures as Json[])[0] = { id: "Gast Erika", metadata: "wedding-guest/metadata.json" };
    });
    expectRefused(files, "figure_list");
  });

  it("[MAP-06] refuses a figure label of more than 30 characters", () => {
    const files = edit(world(), "avatar/figures.json", (f) => {
      (f.figures as Json[])[0] = {
        id: "gast",
        label: "x".repeat(31),
        metadata: "wedding-guest/metadata.json",
      };
    });
    expectRefused(files, "figure_list");
  });

  it("[MAP-06] a figure without a label is accepted", () => {
    expectAccepted(world());
  });

  it("[MAP-06] refuses a figure whose metadata is missing", () => {
    const files = world();
    delete files["avatar/male-guest/metadata.json"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses metadata that is not a PixelLab metadata file", () => {
    const files = world();
    files["avatar/male-guest/metadata.json"] = json({ group_id: "x" });
    expectRefused(files, "figure_metadata");
  });

  it("[MAP-06] the metadata's other fields are ignored, which is the exception to the unknown-field rule", () => {
    const files = editMetadata(world(), "male-guest", (state) => {
      state.prompt = "frei";
      state.anything = { an: "other" };
    });
    expectAccepted(files);
  });

  it("[MAP-06] refuses a frame that is missing", () => {
    const files = world();
    delete files["avatar/male-guest/Idle/rotations/east.png"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses a frame that is not the size of the canvas", () => {
    const files = world();
    files["avatar/male-guest/Idle/rotations/east.png"] = encodePng(32, 32, [0, 0, 0]);
    expectRefused(files, "figure_frame");
  });

  it("[MAP-06] refuses a walk whose directions do not have the same number of frames", () => {
    const files = editMetadata(world(), "male-guest", (state) => {
      const walking = ((state.frames as Json).animations as Json).walking as Json;
      walking.north = (walking.north as string[]).slice(1);
    });
    expectRefused(files, "figure_frame");
  });

  it("[MAP-06] refuses a walk of more than 16 frames", () => {
    const files = editMetadata(world(), "male-guest", (state) => {
      const walking = ((state.frames as Json).animations as Json).walking as Json;
      for (const direction of ["south", "west", "east", "north"]) {
        walking[direction] = Array.from({ length: 17 }, () => (walking[direction] as string[])[0]);
      }
    });
    expectRefused(files, "figure_frame");
  });

  it("[MAP-06] refuses a canvas larger than 256 pixels a side", () => {
    const files = editMetadata(world(), "male-guest", (state) => {
      (state.character as Json).size = { width: 300, height: 300 };
    });
    expectRefused(files, "figure_frame");
  });

  it("[MAP-06] refuses a frame outside the figure's folder", () => {
    const files = editMetadata(world(), "male-guest", (state) => {
      ((state.frames as Json).rotations as Json).south =
        "../wedding-guest/Idle/rotations/south.png";
    });
    expectRefused(files, "figure_frame");
  });

  it("[MAP-16] refuses a PNG in avatar/ that no figure names", () => {
    const files = world();
    files["avatar/male-guest/Idle/extra.png"] = encodePng(16, 16, [0, 0, 0]);
    expectRefused(files, "file_unreferenced");
  });

  it("[MAP-16] refuses a metadata file that no figure names", () => {
    const files = world();
    files["avatar/spare/metadata.json"] = json({});
    expectRefused(files, "file_unreferenced");
  });
});

describe("the door scene (10.4, 14.4)", () => {
  it("[MAP-06] refuses a door without its sprite sheet", () => {
    const files = world();
    delete files["door/door.png"];
    expectRefused(files, "file_missing");
  });

  it("[ACS-12] refuses a door sheet that does not hold the frames it names", () => {
    const files = world();
    files["door/door.png"] = encodePng(100, 32, [0, 0, 0]);
    expectRefused(files, "door_sheet");
  });

  it("[MAP-06] refuses a door.json with an unknown key", () => {
    const files = edit(world(), "door/door.json", (d) => {
      d.extra = 1;
    });
    expectRefused(files, "json_field");
  });

  it("[MAP-06] a package without the door folder has no door scene and no finding", () => {
    const files = world();
    const withoutDoor = Object.fromEntries(
      Object.entries(files).filter(([path]) => !path.startsWith("door/")),
    );
    const result = checkWorldPackage(archive(withoutDoor));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.package.door).toBeUndefined();
  });
});

describe("references between the maps (MAP-08)", () => {
  it("[MAP-06] a portal to a spawn point of another map of the package is accepted", () => {
    expectAccepted(world());
  });

  it("[MAP-06] a portal to a spawn point that the target map does not have is an error", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      setProperty(objectNamed(m, "zum-garten"), "targetSpawn", "eingang");
    });
    expectRefused(files, "map_reference");
  });
});
