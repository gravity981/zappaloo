import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { buildArchive, encodePngPixels } from "../backend/src/packages/build.ts";
import { testWorldFiles } from "../backend/src/world/build.ts";
import type { Page } from "@playwright/test";

const TILED_CLI = process.env.TILED_BIN ?? "tiled";
const MAP_WIDTH = 4;
const MAP_HEIGHT = 3;
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

function fixtureTileset(): Buffer {
  const colors: [number, number, number][] = [
    [0x9c, 0xb8, 0x6e],
    [0x7a, 0x9e, 0x55],
    [0xc9, 0xb0, 0x7a],
    [0x6f, 0x6f, 0x78],
  ];
  return encodePngPixels(TILE_WIDTH * 2, TILE_HEIGHT * 2, (x, y) => {
    const column = Math.floor(x / TILE_WIDTH);
    const row = Math.floor(y / TILE_HEIGHT);
    const id = column + row * 2;
    const localX = (x % TILE_WIDTH) - TILE_WIDTH / 2;
    const localY = (y % TILE_HEIGHT) - TILE_HEIGHT / 2;
    const inside = Math.abs(localX) / (TILE_WIDTH / 2) + Math.abs(localY) / (TILE_HEIGHT / 2) <= 1;
    const [red, green, blue] = colors[id] ?? [0, 0, 0];
    const mark = localX === 0 && localY === -8;
    return [red, green, blue, inside || mark ? 255 : 0];
  });
}

function fixtureCollectionImage(
  width: number,
  height: number,
  color: [number, number, number],
  mark: [number, number, number],
): Buffer {
  return encodePngPixels(width, height, (x, y) => {
    const localX = x - width / 2;
    const localY = y - height;
    const inside =
      Math.abs(localX) / (width / 2) + Math.abs(localY) / height <= 1 &&
      ((Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 || y === height - 1);
    const selected = x === Math.floor(width / 2) && y === height - 2 ? mark : color;
    return [...selected, inside ? 255 : 0];
  });
}

function fixtureMap() {
  const ground = [1, 2, 1, 2, 3, 4, 3, 4, 1, 3, 2, 4];
  const spawn = {
    id: 1,
    name: "start",
    type: "spawn",
    x: 32,
    y: 32,
    point: true,
    rotation: 0,
    visible: true,
  };
  const collision = {
    id: 2,
    name: "",
    type: "collision",
    x: 0,
    y: 0,
    width: 16,
    height: 8,
    rotation: 0,
    visible: true,
  };
  return {
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    infinite: false,
    layers: [
      {
        id: 1,
        type: "tilelayer",
        name: "Ground",
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        x: 0,
        y: 0,
        offsetx: 0,
        offsety: 0,
        opacity: 1,
        visible: true,
        data: ground,
        encoding: "csv",
      },
      {
        id: 2,
        type: "objectgroup",
        name: "Props",
        visible: true,
        opacity: 1,
        draworder: "topdown",
        objects: [
          {
            id: 3,
            name: "placed-art",
            type: "decoration",
            x: 64,
            y: 32,
            width: TILE_WIDTH,
            height: TILE_HEIGHT,
            rotation: 0,
            visible: true,
            gid: 4,
          },
        ],
      },
      {
        id: 3,
        type: "objectgroup",
        name: "Gameplay",
        visible: false,
        opacity: 1,
        draworder: "topdown",
        objects: [spawn, collision],
      },
      {
        id: 4,
        type: "tilelayer",
        name: "collision",
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        visible: true,
        opacity: 1,
        data: Array<number>(MAP_WIDTH * MAP_HEIGHT).fill(0),
        encoding: "csv",
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: "parity",
        tilewidth: TILE_WIDTH,
        tileheight: TILE_HEIGHT,
        tilecount: 4,
        columns: 2,
        objectalignment: "bottom",
        image: "../tilesets/parity.png",
        imagewidth: TILE_WIDTH * 2,
        imageheight: TILE_HEIGHT * 2,
      },
    ],
  };
}

function fixturePlacementMap() {
  const width = 5;
  const height = 3;
  return {
    type: "map",
    orientation: "isometric",
    renderorder: "right-down",
    width,
    height,
    tilewidth: TILE_WIDTH,
    tileheight: TILE_HEIGHT,
    infinite: false,
    layers: [
      {
        id: 1,
        type: "tilelayer",
        name: "Ground",
        width,
        height,
        x: 0,
        y: 0,
        offsetx: 0,
        offsety: 0,
        opacity: 1,
        visible: true,
        data: [1, 2, 1, 2, 3, 3, 4, 3, 4, 1, 1, 3, 2, 4, 2],
        encoding: "csv",
      },
      {
        id: 2,
        type: "tilelayer",
        name: "Collection ground",
        width,
        height,
        x: 0,
        y: 0,
        offsetx: 0,
        offsety: 0,
        opacity: 1,
        visible: true,
        data: [0, 5, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 9, 0],
        encoding: "csv",
      },
      {
        id: 3,
        type: "objectgroup",
        name: "Props",
        visible: true,
        opacity: 1,
        draworder: "topdown",
        objects: [
          {
            id: 3,
            name: "large",
            type: "decoration",
            x: 64,
            y: 96,
            width: 88,
            height: 56,
            rotation: 0,
            visible: true,
            gid: 5,
          },
          {
            id: 4,
            name: "medium",
            type: "decoration",
            x: 96,
            y: 96,
            width: 64,
            height: 40,
            rotation: 0,
            visible: true,
            gid: 9,
          },
        ],
      },
      {
        id: 4,
        type: "objectgroup",
        name: "Gameplay",
        visible: false,
        opacity: 1,
        draworder: "topdown",
        objects: [
          {
            id: 5,
            name: "start",
            type: "spawn",
            x: 32,
            y: 32,
            point: true,
            rotation: 0,
            visible: true,
          },
        ],
      },
      {
        id: 5,
        type: "tilelayer",
        name: "collision",
        width,
        height,
        visible: true,
        opacity: 1,
        data: Array<number>(width * height).fill(0),
        encoding: "csv",
      },
    ],
    tilesets: [
      {
        firstgid: 1,
        name: "parity",
        tilewidth: TILE_WIDTH,
        tileheight: TILE_HEIGHT,
        tilecount: 4,
        columns: 2,
        objectalignment: "bottom",
        image: "../tilesets/parity.png",
        imagewidth: TILE_WIDTH * 2,
        imageheight: TILE_HEIGHT * 2,
      },
      {
        firstgid: 5,
        name: "collection-bottom",
        tilewidth: TILE_WIDTH,
        tileheight: TILE_HEIGHT,
        tilecount: 4,
        columns: 0,
        objectalignment: "bottom",
        tileoffset: { x: 0, y: 0 },
        tiles: [
          {
            id: 0,
            image: "../tilesets/large.png",
            imagewidth: 88,
            imageheight: 56,
          },
          {
            id: 3,
            image: "../tilesets/small.png",
            imagewidth: 40,
            imageheight: 24,
          },
        ],
      },
      {
        firstgid: 9,
        name: "collection-bottom",
        tilewidth: TILE_WIDTH,
        tileheight: TILE_HEIGHT,
        tilecount: 1,
        columns: 0,
        objectalignment: "bottom",
        tileoffset: { x: -3, y: 2 },
        tiles: [
          {
            id: 0,
            image: "../tilesets/medium.png",
            imagewidth: 64,
            imageheight: 40,
            objectgroup: {
              type: "objectgroup",
              name: "",
              objects: [
                {
                  id: 1,
                  name: "collision",
                  x: 8,
                  y: 24,
                  polygon: [
                    { x: 0, y: 0 },
                    { x: 48, y: 0 },
                    { x: 24, y: 12 },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export interface TiledParityFixture {
  archive: Buffer;
  reference: string;
  reference2x: string;
  referenceSize: { width: number; height: number };
  reference2xSize: { width: number; height: number };
}

function pngSize(path: string): { width: number; height: number } {
  const png = readFileSync(path);
  if (png.toString("hex", 0, 8) !== "89504e470d0a1a0a") {
    throw new Error(`Tiled rasterizer did not produce a PNG: ${path}`);
  }
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** Builds independent public Tiled JSON/PNG fixtures and renders their references with the pinned CLI. */
function createTiledFixture(
  directory: string,
  map: ReturnType<typeof fixtureMap> | ReturnType<typeof fixturePlacementMap>,
  images: Record<string, Buffer>,
): TiledParityFixture {
  const root = join(directory, "world");
  const mapsDir = join(root, "maps");
  const tilesetsDir = join(root, "tilesets");
  mkdirSync(mapsDir, { recursive: true });
  mkdirSync(tilesetsDir, { recursive: true });

  const mapPath = join(mapsDir, "kirche.tmj");
  const exportedMap = join(mapsDir, "kirche.json");
  const reference = join(directory, "tiled-reference.png");
  const reference2x = join(directory, "tiled-reference-2x.png");
  writeFileSync(mapPath, JSON.stringify(map));
  for (const [image, contents] of Object.entries(images)) {
    writeFileSync(join(tilesetsDir, image), contents);
  }

  execFileSync(
    TILED_CLI,
    ["--export-map", "--embed-tilesets", "--minimize", mapPath, exportedMap],
    { stdio: "pipe" },
  );
  execFileSync(TILED_CLI, ["tmxrasterizer", "--no-smoothing", mapPath, reference], {
    stdio: "pipe",
  });
  execFileSync(
    TILED_CLI,
    ["tmxrasterizer", "--no-smoothing", "--scale", "2", mapPath, reference2x],
    { stdio: "pipe" },
  );

  const files: Record<string, Buffer> = {};
  for (const [path, content] of Object.entries(testWorldFiles())) {
    if ((path.startsWith("maps/") && path !== "maps/kirche.json") || path.startsWith("tilesets/")) {
      continue;
    }
    files[path] = content;
  }
  files["maps/kirche.json"] = readFileSync(exportedMap);
  for (const image of Object.keys(images)) {
    files[`tilesets/${image}`] = readFileSync(join(tilesetsDir, image));
  }
  return {
    archive: buildArchive(files),
    reference,
    reference2x,
    referenceSize: pngSize(reference),
    reference2xSize: pngSize(reference2x),
  };
}

export function createTiledParityFixture(directory: string): TiledParityFixture {
  return createTiledFixture(directory, fixtureMap(), { "parity.png": fixtureTileset() });
}

export function createTiledNativeCollectionFixture(directory: string): TiledParityFixture {
  const map = fixtureNativePlacementMap();
  const artifacts = map.layers.find(
    (layer) => layer.type === "objectgroup" && layer.name === "Props",
  );
  if (artifacts?.type === "objectgroup") artifacts.objects = [];
  return createTiledFixture(directory, map, fixturePlacementImages());
}

export function createTiledNativeObjectFixture(directory: string): TiledParityFixture {
  const map = fixtureNativePlacementMap();
  const artifacts = map.layers.find(
    (layer) => layer.type === "objectgroup" && layer.name === "Props",
  );
  if (artifacts?.type === "objectgroup") {
    artifacts.objects = [
      {
        id: 3,
        name: "native-bottom",
        type: "decoration",
        x: 96,
        y: 96,
        width: 64,
        height: 40,
        rotation: 0,
        visible: true,
        gid: 9,
      },
    ];
  }
  return createTiledFixture(directory, map, fixturePlacementImages());
}

export function createTiledNativeLayeringFixture(directory: string): TiledParityFixture {
  const map = fixtureNativePlacementMap();
  const artifacts = map.layers.find(
    (layer) => layer.type === "objectgroup" && layer.name === "Props",
  );
  if (artifacts?.type === "objectgroup") {
    artifacts.objects = [
      {
        id: 3,
        name: "behind",
        type: "decoration",
        x: 96,
        y: 96,
        width: 64,
        height: 40,
        rotation: 0,
        visible: true,
        gid: 9,
      },
      {
        id: 4,
        name: "in-front",
        type: "decoration",
        x: 96,
        y: 128,
        width: 64,
        height: 40,
        rotation: 0,
        visible: true,
        gid: 9,
      },
    ];
  }
  const foreground = Array<number>(15).fill(0);
  foreground[7] = 5;
  map.layers.splice(3, 0, {
    id: 6,
    type: "tilelayer",
    name: "Foreground",
    width: 5,
    height: 3,
    x: 0,
    y: 0,
    offsetx: 0,
    offsety: 0,
    opacity: 1,
    visible: true,
    data: foreground,
    encoding: "csv",
  });
  return createTiledFixture(directory, map, fixturePlacementImages());
}

function fixtureNativePlacementMap(): ReturnType<typeof fixturePlacementMap> {
  const map = fixturePlacementMap();
  for (const set of map.tilesets) {
    if ("tileoffset" in set) set.tileoffset = { x: 0, y: 0 };
  }
  return map;
}

function fixturePlacementImages(): Record<string, Buffer> {
  return {
    "parity.png": fixtureTileset(),
    "large.png": fixtureCollectionImage(88, 56, [0x64, 0x9a, 0xc8], [0xfa, 0xd1, 0x6a]),
    "small.png": fixtureCollectionImage(40, 24, [0xb2, 0x69, 0x8d], [0xff, 0xe0, 0x75]),
    "medium.png": fixtureCollectionImage(64, 40, [0x67, 0xa2, 0x70], [0xf4, 0xaa, 0x5c]),
  };
}

export interface ParityMeasurement {
  dimensionsMatch: boolean;
  expected: { width: number; height: number; bounds: Bounds | null };
  actual: { width: number; height: number; bounds: Bounds | null };
  differingVisiblePixels: number;
  differingBounds: Bounds | null;
}

interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Compares a Tiled reference with the real Phaser canvas without alignment or pixel masks. */
export async function comparePhaserCanvas(
  page: Page,
  referencePath: string,
): Promise<ParityMeasurement> {
  const reference = `data:image/png;base64,${readFileSync(referencePath).toString("base64")}`;
  return page.evaluate(async (referenceData) => {
    const loadImage = (source: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          resolve(image);
        };
        image.onerror = () => {
          reject(new Error("could not load a parity image"));
        };
        image.src = source;
      });
    const canvasElement = document.querySelector<HTMLCanvasElement>("canvas");
    if (canvasElement === null) throw new Error("could not find the Phaser canvas");
    const [expectedImage, actualImage] = await Promise.all([
      loadImage(referenceData),
      loadImage(canvasElement.toDataURL("image/png")),
    ]);
    const pixels = (image: HTMLImageElement) => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("could not create a parity canvas");
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const expectedPixels = pixels(expectedImage);
    const actualPixels = pixels(actualImage);
    const boundsOf = (data: Uint8ClampedArray, width: number, height: number): Bounds | null => {
      let left = width;
      let top = height;
      let right = -1;
      let bottom = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (data[(y * width + x) * 4 + 3] === 0) continue;
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
      return right < 0 ? null : { left, top, right, bottom };
    };
    const width = Math.max(expectedImage.naturalWidth, actualImage.naturalWidth);
    const height = Math.max(expectedImage.naturalHeight, actualImage.naturalHeight);
    let differingVisiblePixels = 0;
    let differingBounds: Bounds | null = null;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = (y * expectedImage.naturalWidth + x) * 4;
        const actualIndex = (y * actualImage.naturalWidth + x) * 4;
        const expectedInside = x < expectedImage.naturalWidth && y < expectedImage.naturalHeight;
        const actualInside = x < actualImage.naturalWidth && y < actualImage.naturalHeight;
        const expectedIndex = expectedInside ? index : -1;
        const actualPixelIndex = actualInside ? actualIndex : -1;
        const expectedAlpha = expectedIndex < 0 ? 0 : (expectedPixels[expectedIndex + 3] ?? 0);
        const actualAlpha = actualPixelIndex < 0 ? 0 : (actualPixels[actualPixelIndex + 3] ?? 0);
        if (expectedAlpha === 0 && actualAlpha === 0) continue;
        if (
          (expectedIndex < 0 ? 0 : (expectedPixels[expectedIndex] ?? 0)) !==
            (actualPixelIndex < 0 ? 0 : (actualPixels[actualPixelIndex] ?? 0)) ||
          (expectedIndex < 0 ? 0 : (expectedPixels[expectedIndex + 1] ?? 0)) !==
            (actualPixelIndex < 0 ? 0 : (actualPixels[actualPixelIndex + 1] ?? 0)) ||
          (expectedIndex < 0 ? 0 : (expectedPixels[expectedIndex + 2] ?? 0)) !==
            (actualPixelIndex < 0 ? 0 : (actualPixels[actualPixelIndex + 2] ?? 0)) ||
          expectedAlpha !== actualAlpha
        ) {
          differingVisiblePixels += 1;
          differingBounds =
            differingBounds === null
              ? { left: x, top: y, right: x, bottom: y }
              : {
                  left: Math.min(differingBounds.left, x),
                  top: Math.min(differingBounds.top, y),
                  right: Math.max(differingBounds.right, x),
                  bottom: Math.max(differingBounds.bottom, y),
                };
        }
      }
    }
    return {
      dimensionsMatch:
        expectedImage.naturalWidth === actualImage.naturalWidth &&
        expectedImage.naturalHeight === actualImage.naturalHeight,
      expected: {
        width: expectedImage.naturalWidth,
        height: expectedImage.naturalHeight,
        bounds: boundsOf(expectedPixels, expectedImage.naturalWidth, expectedImage.naturalHeight),
      },
      actual: {
        width: actualImage.naturalWidth,
        height: actualImage.naturalHeight,
        bounds: boundsOf(actualPixels, actualImage.naturalWidth, actualImage.naturalHeight),
      },
      differingVisiblePixels,
      differingBounds,
    };
  }, reference);
}
