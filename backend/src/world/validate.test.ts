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

/** The files without those whose paths start with the folder. */
function withoutFolder(files: Files, folder: string): Files {
  return Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith(folder)));
}

/** The map object (or any object of the map's object layers) with a name. */
function objectNamed(map: Json, name: string): Json {
  const layers = map.layers as Json[];
  for (const layer of layers) {
    for (const object of (layer.objects as Json[] | undefined) ?? []) {
      if (object.name === name) return object;
    }
  }
  throw new Error(`no object ${name}`);
}

/** Sets a custom property of an object, replacing its value or adding it. */
function setProperty(object: Json, name: string, value: unknown): void {
  const properties = (object.properties ?? []) as Json[];
  const found = properties.find((property) => property.name === name);
  if (found) found.value = value;
  else properties.push({ name, type: "string", value });
  object.properties = properties;
}

function removeProperty(object: Json, name: string): void {
  object.properties = ((object.properties ?? []) as Json[]).filter(
    (property) => property.name !== name,
  );
}

/** The errors and warnings of a check, by their codes. */
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

/** The archive as tar bytes, to change its headers. */
function headersOf(gzipped: Buffer): Buffer {
  return gunzipSync(gzipped);
}

/** Sets the type byte of the first entry of a tar archive and recomputes its checksum. */
function withEntryType(gzipped: Buffer, type: string): Buffer {
  const tar = headersOf(gzipped);
  const header = tar.subarray(0, 512);
  header.write(type, 156, 1, "latin1");
  header.fill(0x20, 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "latin1");
  return gzipSync(tar);
}

describe("the test world", () => {
  it("[MAP-06] the generated test world passes every rule without a finding", () => {
    const result = checkWorldPackage(buildTestWorld());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
    if (result.ok) expect(result.package.mapIds.sort()).toEqual(["garten", "kirche", "saal"]);
  });

  it("[MAP-16] the package has the door scene and the avatar parts of the test world", () => {
    const result = checkWorldPackage(buildTestWorld());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.package.door?.sheet.frames).toBe(4);
    expect(result.package.door?.glimpse).toBe(true);
    expect(result.package.avatar.parts.hair.options).toHaveLength(2);
    expect(result.package.manifest.startMap).toBe("kirche");
  });
});

describe("the archive and the layout (MAP-16)", () => {
  it("[MAP-16] refuses an archive of more than 40 MB", () => {
    const big = Buffer.alloc(WORLD_LIMITS.archiveBytes + 1);
    expect(codes(checkWorldPackage(big).findings)).toEqual(["archive_too_large"]);
  });

  it("[MAP-16] refuses an archive that unpacks to more than 100 MB", () => {
    const big = gzipSync(Buffer.alloc(WORLD_LIMITS.unpackedBytes + 1));
    expect(codes(checkWorldPackage(big).findings)).toEqual(["unpacked_too_large"]);
  });

  it("[MAP-16] refuses an archive with more than 500 files and folders", () => {
    const files: Files = {};
    for (let i = 0; i <= WORLD_LIMITS.files; i++) files[`f${String(i)}.txt`] = Buffer.from("x");
    expect(codes(checkWorldPackage(archive(files)).findings)).toEqual(["too_many_files"]);
  });

  it("[MAP-16] refuses a link in the archive", () => {
    const linked = withEntryType(archive(world()), "2");
    expect(codes(checkWorldPackage(linked).findings)).toContain("entry_type");
  });

  it("[MAP-16] refuses a path with .. or an absolute path", () => {
    expectRefused({ ...world(), "../escape.png": Buffer.from("x") }, "entry_path");
  });

  it("[MAP-16] refuses a file the layout does not name", () => {
    for (const path of ["maps/kirche.tmx", "tilesets/boden.tsx", "notes.txt", "maps/sub/x.json"]) {
      expectRefused({ ...world(), [path]: Buffer.from("x") }, "file_not_in_layout");
    }
  });

  it("[MAP-16] refuses a tileset whose name is not a PNG name", () => {
    const files = world();
    files["tilesets/a b.png"] = encodePng(16, 16, [0, 0, 0]);
    expectRefused(files, "file_not_in_layout");
  });

  it("[MAP-16] refuses a package without its manifest", () => {
    const files = world();
    delete files["manifest.json"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-16] refuses a package without any map", () => {
    const files = world();
    expectRefused(withoutFolder(files, "maps/"), "file_missing");
  });

  it("[MAP-16] refuses a JSON file that is not valid JSON", () => {
    expectRefused({ ...world(), "manifest.json": Buffer.from("{") }, "json_invalid");
  });

  it("[MAP-16] refuses a JSON file of more than 5 MB", () => {
    const files = world();
    edit(files, "maps/garten.json", (map) => {
      map.padding = "x".repeat(WORLD_LIMITS.jsonBytes);
    });
    expectRefused(files, "json_too_large");
  });

  it("[MAP-16] refuses a PNG file of more than 8 MB", () => {
    const files = world();
    files["tilesets/dekor.png"] = Buffer.concat([
      files["tilesets/dekor.png"] ?? Buffer.alloc(0),
      Buffer.alloc(WORLD_LIMITS.imageBytes),
    ]);
    expectRefused(files, "file_too_large");
  });

  it("[MAP-16] refuses a file that is not a PNG where a PNG belongs", () => {
    const files = world();
    files["tilesets/boden.png"] = Buffer.from("not an image");
    expectRefused(files, "image_not_png");
  });

  it("[MAP-16] refuses a PNG of more than 4096 pixels a side", () => {
    const files = world();
    files["tilesets/gross.png"] = encodePng(4097, 1, [0, 0, 0]);
    expectRefused(files, "image_size");
  });
});

describe("the manifest (MAP-06)", () => {
  it("[MAP-06] refuses a format version the platform does not read", () => {
    expectRefused(
      edit(world(), "manifest.json", (m) => (m.formatVersion = 2)),
      "format_version",
    );
  });

  it("[MAP-06] refuses a manifest with an unknown field", () => {
    expectRefused(
      edit(world(), "manifest.json", (m) => (m.extra = true)),
      "json_field",
    );
  });

  it("[MAP-06] refuses a kind that is not zappaloo-world", () => {
    expectRefused(
      edit(world(), "manifest.json", (m) => (m.kind = "zappaloo-theme")),
      "json_field",
    );
  });

  it("[MAP-06] refuses a tile size outside 8–64", () => {
    expectRefused(
      edit(world(), "manifest.json", (m) => (m.tileSize = 4)),
      "json_field",
    );
  });

  it("[MAP-06] refuses a start map that is not in the package", () => {
    expectRefused(
      edit(world(), "manifest.json", (m) => (m.startMap = "dach")),
      "map_reference",
    );
  });

  it("[MAP-06] accepts $schema, which only names the schema for editors", () => {
    const files = edit(
      world(),
      "manifest.json",
      (m) => (m.$schema = "./world-manifest.v1.schema.json"),
    );
    expect(checkWorldPackage(archive(files)).ok).toBe(true);
  });
});

describe("the maps (MAP-06, MAP-08)", () => {
  it("[MAP-06] refuses a map id that is not 1–40 characters of a–z, 0–9 and -", () => {
    const files = world();
    files["maps/Kirche.json"] = files["maps/kirche.json"] ?? Buffer.alloc(0);
    delete files["maps/kirche.json"];
    expectRefused(files, "map_id");
  });

  it("[MAP-06] refuses a map that is not valid JSON", () => {
    expectRefused({ ...world(), "maps/kirche.json": Buffer.from("[") }, "json_invalid");
  });

  it("[MAP-06] refuses a map that is not orthogonal", () => {
    expectRefused(
      edit(world(), "maps/kirche.json", (m) => (m.orientation = "isometric")),
      "map_format",
    );
  });

  it("[MAP-06] refuses an infinite map", () => {
    expectRefused(
      edit(world(), "maps/kirche.json", (m) => (m.infinite = true)),
      "map_format",
    );
  });

  it("[MAP-06] refuses tiles that are not of the package's tile size", () => {
    expectRefused(
      edit(world(), "maps/kirche.json", (m) => (m.tilewidth = 32)),
      "map_format",
    );
  });

  it("[MAP-06] refuses a map larger than 200 × 200 tiles", () => {
    expectRefused(
      edit(world(), "maps/kirche.json", (m) => (m.width = 201)),
      "map_format",
    );
  });

  it("[MAP-06] refuses an image layer", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      (m.layers as Json[]).push({ type: "imagelayer", name: "bild", image: "x.png", id: 99 });
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a group layer", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      (m.layers as Json[]).push({ type: "group", name: "gruppe", layers: [], id: 98 });
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses compressed tile data", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const layer = (m.layers as Json[]).find((item) => item.name === "boden");
      if (layer) layer.compression = "zlib";
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
      const layer = (m.layers as Json[]).find((item) => item.name === "boden");
      if (layer) (layer.data as number[]).pop();
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a Base64 layer that is not whole tile ids", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      const layer = (m.layers as Json[]).find((item) => item.name === "boden");
      if (layer) layer.data = Buffer.alloc(5).toString("base64");
    });
    expectRefused(files, "map_layer");
  });

  it("[MAP-06] refuses a tile id that no tileset holds", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const layer = (m.layers as Json[]).find((item) => item.name === "boden");
      if (layer) (layer.data as number[])[0] = 999;
    });
    expectRefused(files, "map_tiles");
  });

  it("[MAP-06] refuses an external tileset", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      (m.tilesets as Json[])[0] = {
        firstgid: 1,
        name: "boden",
        source: "boden.tsx",
        tilewidth: 16,
        tileheight: 16,
      };
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a collection of images", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const tileset = (m.tilesets as Json[])[0] ?? {};
      delete tileset.image;
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses an image that is not in tilesets/", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const tileset = (m.tilesets as Json[])[0] ?? {};
      tileset.image = "boden.png";
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a tileset image that is missing from the package", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      const tileset = (m.tilesets as Json[])[1] ?? {};
      tileset.image = "../tilesets/fehlt.png";
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a tileset image that is not a whole number of tiles", () => {
    const files = world();
    files["tilesets/boden.png"] = encodePng(70, 64, [0, 0, 0]);
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses overlapping tile ids of two tilesets", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      (m.tilesets as Json[])[1] = { ...((m.tilesets as Json[])[1] ?? {}), firstgid: 2 };
    });
    expectRefused(files, "map_tileset");
  });

  it("[MAP-06] refuses a map without its spawn point start", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      const layer = (m.layers as Json[]).find((item) => item.name === "objekte");
      if (layer) layer.objects = (layer.objects as Json[]).filter((o) => o.name !== "start");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an object type that is not known", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      objectNamed(m, "wiese").type = "zauber";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an untyped object that is not a point", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      objectNamed(m, "bank").type = "";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an object of a shape its type does not take", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      objectNamed(m, "platz-1").point = undefined;
      objectNamed(m, "platz-1").width = 16;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses an ellipse", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      objectNamed(m, "bank").ellipse = true;
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a name that is used twice among the spawn points, portals and clickable objects", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      objectNamed(m, "spiel").name = "bank";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a clickable object without a valid name", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      objectNamed(m, "bank").name = "Bank";
    });
    expectRefused(files, "map_object");
  });

  it("[MAP-06] refuses a portal without a target map", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      removeProperty(objectNamed(m, "zur-kirche"), "targetMap");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] refuses a portal whose target map is not in the package", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      setProperty(objectNamed(m, "zur-kirche"), "targetMap", "dach");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses a portal whose target spawn is not in the target map", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      setProperty(objectNamed(m, "zur-kirche"), "targetSpawn", "tor");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an approach point that is not a point without a type", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "schild"), "approach", "altar");
    });
    expectRefused(files, "map_reference");
  });

  it("[MAP-06] refuses an action that is not page, content, dialog or minigame", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "schild"), "action", "tanz");
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
      setProperty(objectNamed(m, "altar"), "page", "kasse");
    });
    expectRefused(files, "map_property");
  });

  it("[MAP-06] accepts a content page as p/<slug>", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "page", "p/anreise-parkieren");
    });
    expect(checkWorldPackage(archive(files)).ok).toBe(true);
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
    const seat = objectNamed(read(world(), "maps/saal.json"), "platz-2");
    expect(seat.properties).toEqual([{ name: "table", type: "int", value: 3 }]);
    expect(checkWorldPackage(archive(world())).ok).toBe(true);
  });
});

describe("warnings (MAP-08): listed, the package is still accepted", () => {
  it("[MAP-06] a property the type does not use is a warning", () => {
    const files = edit(world(), "maps/kirche.json", (m) => {
      setProperty(objectNamed(m, "altar"), "contentID", "anreise");
    });
    const result = checkWorldPackage(archive(files));
    expect(result.ok).toBe(true);
    expect(codes(result.findings, "warning")).toContain("property_unknown");
  });

  it("[MAP-06] a map property such as programItem is a warning", () => {
    const files = edit(world(), "maps/garten.json", (m) => {
      m.properties = [{ name: "programItem", type: "string", value: "essen" }];
    });
    const result = checkWorldPackage(archive(files));
    expect(result.ok).toBe(true);
    expect(codes(result.findings, "warning")).toContain("property_unknown");
  });

  it("[MAP-06] a map without collisions is a warning", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      m.layers = (m.layers as Json[]).filter((layer) => layer.name !== "collision");
    });
    const result = checkWorldPackage(archive(files));
    expect(result.ok).toBe(true);
    expect(codes(result.findings, "warning")).toEqual(["map_collision"]);
  });

  it("[MAP-06] a tileset image that no map uses is a warning", () => {
    const files = world();
    files["tilesets/ungenutzt.png"] = encodePng(16, 16, [0, 0, 0]);
    const result = checkWorldPackage(archive(files));
    expect(result.ok).toBe(true);
    expect(codes(result.findings, "warning")).toEqual(["tileset_unused"]);
  });
});

describe("the avatar assets (MAP-06, 7.3)", () => {
  it("[MAP-06] refuses a package without avatar/avatar.json", () => {
    const files = world();
    delete files["avatar/avatar.json"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses avatar.json with an unknown field", () => {
    expectRefused(
      edit(world(), "avatar/avatar.json", (a) => (a.extra = 1)),
      "json_field",
    );
  });

  it("[MAP-06] refuses a part that uses a palette that is not defined", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      ((a.parts as Json).body as Json).palette = "haut";
    });
    expectRefused(files, "avatar_palette");
  });

  it("[MAP-06] refuses an optional body", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      ((a.parts as Json).body as Json).optional = true;
    });
    expectRefused(files, "avatar_part");
  });

  it("[MAP-06] refuses a body without a palette, since its colour is stored", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      delete ((a.parts as Json).body as Json).palette;
    });
    expectRefused(files, "avatar_part");
  });

  it("[MAP-06] refuses an accessory with a palette", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      ((a.parts as Json).accessory as Json).palette = "skin";
    });
    expectRefused(files, "avatar_part");
  });

  it("[MAP-06] refuses an option id that is used twice in one part", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      const options = ((a.parts as Json).outfit as Json).options as Json[];
      options[1] = { ...(options[0] ?? {}), label: "Kopie" };
    });
    expectRefused(files, "avatar_option");
  });

  it("[MAP-06] refuses a sprite sheet that is not 4 × 4 frames of the frame size", () => {
    const files = world();
    files["avatar/body.png"] = encodePng(64, 64, [0, 0, 0]);
    expectRefused(files, "avatar_sheet");
  });

  it("[MAP-06] refuses an option whose sprite sheet is missing", () => {
    const files = world();
    delete files["avatar/hair-lang.png"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses a PNG in avatar/ that avatar.json does not name", () => {
    const files = world();
    files["avatar/unbenannt.png"] = encodePng(64, 96, [0, 0, 0]);
    expectRefused(files, "file_unreferenced");
  });

  it("[MAP-06] refuses a template that names an option the part does not have", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      const template = (a.templates as Json[])[0] ?? {};
      (template.avatar as Json).outfit = "uniform";
    });
    expectRefused(files, "avatar_template");
  });

  it("[MAP-06] refuses a template whose skin colour is not a colour of the body", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      const template = (a.templates as Json[])[0] ?? {};
      (template.avatar as Json).skin = "#123456";
    });
    expectRefused(files, "avatar_template");
  });

  it("[MAP-06] refuses a template without hair where the hair is not optional", () => {
    const files = edit(world(), "avatar/avatar.json", (a) => {
      ((a.parts as Json).hair as Json).optional = false;
      const template = (a.templates as Json[])[0] ?? {};
      (template.avatar as Json).hair = null;
      (template.avatar as Json).hairColor = null;
    });
    expectRefused(files, "avatar_template");
  });
});

describe("the door scene (10.4, 14.4)", () => {
  it("[MAP-06] refuses a door without its sprite sheet", () => {
    const files = world();
    delete files["door/door.png"];
    expectRefused(files, "file_missing");
  });

  it("[MAP-06] refuses a door sheet that does not hold the frames it names", () => {
    const files = edit(world(), "door/door.json", (d) => (d.frames = 3));
    expectRefused(files, "door_sheet");
  });

  it("[MAP-06] refuses a door.json with an unknown key", () => {
    expectRefused(
      edit(world(), "door/door.json", (d) => (d.speed = 2)),
      "json_field",
    );
  });

  it("[MAP-06] a package without the door folder has no door scene and no finding", () => {
    const files = world();
    const result = checkWorldPackage(archive(withoutFolder(files, "door/")));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.package.door).toBeUndefined();
  });
});

describe("references between the maps (MAP-08)", () => {
  it("[MAP-06] a portal to a spawn point of another map of the package is accepted", () => {
    const result = checkWorldPackage(archive(world()));
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("[MAP-06] a portal to a spawn point that the target map does not have is an error", () => {
    const files = edit(world(), "maps/saal.json", (m) => {
      setProperty(objectNamed(m, "zum-garten"), "targetSpawn", "eingang");
    });
    expectRefused(files, "map_reference");
  });
});
