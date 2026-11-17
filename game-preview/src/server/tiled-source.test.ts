import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testWorldFiles } from "../../../backend/src/world/build.ts";
import { checkWorldPackage } from "../../../backend/src/world/validate.ts";
import { readPackageArchive } from "../../../backend/src/packages/archive.ts";
import { WORLD_LIMITS } from "@zappaloo/shared";
import { z } from "zod";
import { exportTiledSource, getTiledSourceInfo, TiledSourceError } from "./tiled-source.ts";

const sourceDirectories: string[] = [];
const exportedMapSchema = z
  .object({
    tilesets: z.array(z.object({ image: z.string().optional() }).loose()).optional(),
    layers: z
      .array(
        z
          .object({
            objects: z.array(z.object({ name: z.string().optional() }).loose()).optional(),
          })
          .loose(),
      )
      .optional(),
  })
  .loose();

afterEach(async () => {
  vi.unstubAllEnvs();
  for (const directory of sourceDirectories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function createSource(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "zappaloo-public-tiled-source-"));
  sourceDirectories.push(root);
  const tiledRoot = join(root, "tiled");
  await mkdir(join(tiledRoot, "maps"), { recursive: true });
  await mkdir(join(tiledRoot, "tilesets"), { recursive: true });
  await mkdir(join(tiledRoot, "templates"), { recursive: true });
  await writeFile(
    join(tiledRoot, "world.tiled-project"),
    JSON.stringify({ commands: [], folders: ["maps", "tilesets", "templates"] }),
  );
  await writeFile(
    join(tiledRoot, "tilesets", "ground.tsx"),
    `<tileset version="1.10" tiledversion="1.12.2" name="ground" tilewidth="64" tileheight="32" tilecount="1" columns="1"><image source="../../ground.png" width="64" height="32"/></tileset>`,
  );
  await writeFile(
    join(tiledRoot, "tilesets", "portal.tsx"),
    `<tileset version="1.10" tiledversion="1.12.2" name="portal" tilewidth="64" tileheight="32" tilecount="1" columns="0" objectalignment="bottomleft"><tile id="0"><image source="../../portal.png" width="64" height="32"/><objectgroup draworder="index"><object id="1" name="trigger" x="0" y="0"><polygon points="32,0 64,16 32,32 0,16"/></object></objectgroup></tile></tileset>`,
  );
  await writeFile(
    join(root, "ground.png"),
    testWorldFiles()["tilesets/portal.png"] ?? Buffer.alloc(0),
  );
  await writeFile(
    join(root, "portal.png"),
    testWorldFiles()["tilesets/portal.png"] ?? Buffer.alloc(0),
  );
  await writeFile(
    join(tiledRoot, "templates", "spawn.tx"),
    `<template><object name="start" class="spawn" x="0" y="0"><point/></object></template>`,
  );

  const map = (spawnX: number, portal = "") =>
    `<?xml version="1.0" encoding="UTF-8"?><map version="1.10" tiledversion="1.12.2" orientation="isometric" renderorder="right-down" width="2" height="2" tilewidth="64" tileheight="32" infinite="0"><tileset firstgid="1" source="../tilesets/ground.tsx"/><tileset firstgid="2" source="../tilesets/portal.tsx"/><layer id="1" name="ground" width="2" height="2"><data encoding="csv">1,1,1,1</data></layer><objectgroup id="2" name="objects"><object id="1" template="../templates/spawn.tx" x="${String(spawnX)}" y="16"/>${portal}</objectgroup></map>`;
  const portal = (target: string) =>
    `<object id="2" name="to-hall" class="portal" gid="2" x="64" y="32"><properties><property name="targetMap" type="string" value="${target}"/><property name="targetSpawn" type="string" value="start"/></properties></object>`;
  await writeFile(join(tiledRoot, "maps", "start.tmx"), map(32, portal("hall")));
  await writeFile(join(tiledRoot, "maps", "hall.tmx"), map(32));

  const worldFiles = testWorldFiles();
  for (const [path, bytes] of Object.entries(worldFiles)) {
    if (!path.startsWith("avatar/")) continue;
    const target = join(root, "figures", path.slice("avatar/".length));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
  return root;
}

describe("local Tiled source export (MAP-18)", () => {
  it("[MAP-18] reports missing source configuration without disabling package loading", async () => {
    vi.stubEnv("ZAPPALOO_TILED_SOURCE_DIR", "");

    const info = await getTiledSourceInfo();
    expect(info.available).toBe(false);
    expect(info.message).toContain("ZAPPALOO_TILED_SOURCE_DIR");
    expect(info.mapIds).toEqual([]);
    await expect(exportTiledSource("start")).rejects.toThrow(TiledSourceError);
  });

  it("[MAP-18][MAP-06][MAP-16] exports all maps and figures through the validated package format", async () => {
    const root = await createSource();
    vi.stubEnv("ZAPPALOO_TILED_SOURCE_DIR", root);

    await expect(getTiledSourceInfo()).resolves.toMatchObject({
      available: true,
      mapIds: ["hall", "start"],
    });
    const archive = await exportTiledSource("start");
    const checked = checkWorldPackage(archive);
    expect(checked.ok).toBe(true);
    if (!checked.ok) throw new Error("generated public Tiled sources must pass world validation");
    expect(checked.package.mapIds).toEqual(["hall", "start"]);
    expect(checked.package.figures.map((figure) => figure.id)).toEqual([
      "male-guest",
      "wedding-guest",
    ]);

    const entries = readPackageArchive(archive, {
      unpackedBytes: WORLD_LIMITS.unpackedBytes,
      maxEntries: WORLD_LIMITS.files,
    });
    const map = exportedMapSchema.parse(
      JSON.parse(
        entries.find((entry) => entry.path === "maps/start.json")?.data.toString("utf8") ?? "null",
      ) as unknown,
    );
    expect(map.tilesets?.[0]?.image).toMatch(/^\.\.\/tilesets\/[a-f0-9]{12}-ground\.png$/);
    expect(
      map.layers?.flatMap((layer) => layer.objects ?? []).map((object) => object.name),
    ).toContain("start");
    expect(
      entries.some(
        (entry) =>
          entry.path === `tilesets/${map.tilesets?.[0]?.image?.slice("../tilesets/".length)}`,
      ),
    ).toBe(true);
  });

  it("[MAP-18][MAP-06] validates portal references against every exported map", async () => {
    const root = await createSource();
    vi.stubEnv("ZAPPALOO_TILED_SOURCE_DIR", root);
    const tiledRoot = join(root, "tiled");
    const portal = `<object id="2" name="to-missing" class="portal" gid="2" x="64" y="32"><properties><property name="targetMap" type="string" value="missing"/><property name="targetSpawn" type="string" value="start"/></properties></object>`;
    await writeFile(
      join(tiledRoot, "maps", "start.tmx"),
      (await readFile(join(tiledRoot, "maps", "start.tmx"), "utf8"))
        .replace('value="hall"', 'value="missing"')
        .replace("</objectgroup>", `${portal}</objectgroup>`),
    );

    let exportError: unknown;
    try {
      await exportTiledSource("start");
    } catch (error) {
      exportError = error;
    }
    expect(exportError).toBeInstanceOf(TiledSourceError);
    if (!(exportError instanceof TiledSourceError)) {
      throw new Error("invalid portal references must be reported as Tiled source findings");
    }
    expect(
      exportError.findings.some(
        (finding) => finding.code === "map_reference" && finding.detail.includes("missing"),
      ),
    ).toBe(true);
  });

  it("[MAP-18] rejects a start map that is not in the configured source", async () => {
    const root = await createSource();
    vi.stubEnv("ZAPPALOO_TILED_SOURCE_DIR", root);

    await expect(exportTiledSource("unknown")).rejects.toThrow(
      "Start map unknown is not in the configured Tiled source.",
    );
  });
});
