import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { buildArchive } from "../../../backend/src/packages/build.ts";
import type { WorldFinding } from "../../../backend/src/world/findings.ts";
import { checkWorldPackage } from "../../../backend/src/world/validate.ts";
import { pixelLabMetadataSchema, WORLD_DIRECTIONS, WORLD_LIMITS } from "@zappaloo/shared";

const execFileAsync = promisify(execFile);
const MAP_ID = /^[a-z0-9-]{1,40}$/;
const SKIP_DIRECTORIES = new Set([
  ".git",
  ".cache",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "world-scratch",
]);

export interface TiledSourceInfo {
  available: boolean;
  message: string;
  mapIds: string[];
}

interface TiledProject {
  path: string;
  root: string;
  mapsDirectory: string;
}

export class TiledSourceError extends Error {
  readonly findings: WorldFinding[];

  constructor(message: string, findings: WorldFinding[] = []) {
    super(message);
    this.name = "TiledSourceError";
    this.findings = findings;
  }
}

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function ignoredDirectory(name: string): boolean {
  return name.startsWith(".") || SKIP_DIRECTORIES.has(name);
}

async function walkFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  const visit = async (path: string): Promise<void> => {
    const entries = (await readdir(path, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const child = join(path, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirectory(entry.name)) await visit(child);
      } else if (entry.isFile()) {
        files.push(child);
      }
    }
  };
  await visit(directory);
  return files.sort();
}

export async function resolveTiledSourceRoot(
  configuredPath = process.env.ZAPPALOO_TILED_SOURCE_DIR,
): Promise<string> {
  if (configuredPath === undefined || configuredPath.trim() === "") {
    throw new TiledSourceError(
      "Local Tiled source is unavailable. Set ZAPPALOO_TILED_SOURCE_DIR to the asset checkout; package loading still works.",
    );
  }
  if (!isAbsolute(configuredPath)) {
    throw new TiledSourceError("ZAPPALOO_TILED_SOURCE_DIR must be an absolute path.");
  }
  const candidate = resolve(configuredPath);
  let root: string;
  try {
    root = await realpath(candidate);
  } catch (error) {
    throw new TiledSourceError(
      `ZAPPALOO_TILED_SOURCE_DIR does not point to a readable directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    if (!(await stat(root)).isDirectory())
      throw new Error("the configured path is not a directory");
  } catch (error) {
    throw new TiledSourceError(
      `ZAPPALOO_TILED_SOURCE_DIR is unusable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return root;
}

async function findTiledProject(root: string): Promise<TiledProject> {
  const projects = (await walkFiles(root)).filter((path) => path.endsWith(".tiled-project"));
  if (projects.length !== 1) {
    throw new TiledSourceError(
      projects.length === 0
        ? "The configured source has no .tiled-project file."
        : "The configured source has more than one .tiled-project file; select a source with one project.",
    );
  }
  const projectPath = projects[0];
  if (projectPath === undefined) throw new Error("Tiled project discovery returned no path");

  let project: unknown;
  try {
    project = JSON.parse(await readFile(projectPath, "utf8")) as unknown;
  } catch (error) {
    throw new TiledSourceError(
      `Could not read Tiled project configuration: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    typeof project !== "object" ||
    project === null ||
    !("folders" in project) ||
    !Array.isArray(project.folders) ||
    !project.folders.includes("maps")
  ) {
    throw new TiledSourceError("The Tiled project must define its maps folder as `maps`.");
  }
  const projectRoot = dirname(projectPath);
  const mapsDirectory = resolve(projectRoot, "maps");
  if (!isWithin(projectRoot, mapsDirectory))
    throw new Error("Tiled maps directory escaped its project");
  try {
    if (!(await stat(mapsDirectory)).isDirectory())
      throw new Error("the maps folder is not a directory");
  } catch (error) {
    throw new TiledSourceError(
      `The Tiled project's maps folder is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { path: projectPath, root: projectRoot, mapsDirectory };
}

async function listMaps(project: TiledProject): Promise<Map<string, string>> {
  const maps = new Map<string, string>();
  const paths = (await walkFiles(project.mapsDirectory)).filter(
    (path) => extname(path).toLowerCase() === ".tmx",
  );
  for (const path of paths) {
    const id = basename(path, extname(path));
    if (!MAP_ID.test(id)) {
      throw new TiledSourceError(
        `Tiled map ${relative(project.root, path)} must have a 1–40 character lowercase id using a–z, 0–9 and -.`,
      );
    }
    if (maps.has(id)) {
      throw new TiledSourceError(`More than one Tiled map has the id ${id}.`);
    }
    maps.set(id, path);
  }
  if (maps.size === 0)
    throw new TiledSourceError("The Tiled project's maps folder has no .tmx maps.");
  return new Map([...maps].sort(([left], [right]) => left.localeCompare(right)));
}

export async function getTiledSourceInfo(): Promise<TiledSourceInfo> {
  try {
    const root = await resolveTiledSourceRoot();
    const project = await findTiledProject(root);
    const maps = await listMaps(project);
    return {
      available: true,
      message: "Local Tiled source is ready.",
      mapIds: [...maps.keys()],
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : String(error),
      mapIds: [],
    };
  }
}

async function verifyTiledVersion(): Promise<void> {
  let result: { stdout: string; stderr: string };
  try {
    result = await execFileAsync("tiled", ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new TiledSourceError(
      `The pinned Tiled 1.12.2 CLI is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!/^Tiled 1\.12\.2(?:\s|$)/m.test(result.stdout)) {
    throw new TiledSourceError(
      `The local source workflow requires Tiled 1.12.2; found ${(result.stdout || result.stderr).trim() || "an unknown version"}.`,
    );
  }
}

async function runTiledExport(
  project: TiledProject,
  sourceMap: string,
  destination: string,
): Promise<void> {
  try {
    await execFileAsync(
      "tiled",
      [
        "--new-instance",
        "--project",
        project.path,
        "--detach-templates",
        "--resolve-types-and-properties",
        "--embed-tilesets",
        "--export-map",
        "json",
        sourceMap,
        destination,
      ],
      {
        cwd: project.root,
        encoding: "utf8",
        timeout: 60_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
  } catch (error) {
    const detail =
      typeof error === "object" && error !== null && "stderr" in error
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new TiledSourceError(
      `Tiled could not export ${relative(project.root, sourceMap)}: ${detail || "export failed"}`,
    );
  }
}

async function sourceFile(root: string, path: string): Promise<{ path: string; bytes: Buffer }> {
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch (error) {
    throw new TiledSourceError(
      `A source asset is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isWithin(root, resolved))
    throw new TiledSourceError("A source asset resolves outside the configured checkout.");
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new TiledSourceError("A source asset is not a regular file.");
  return { path: resolved, bytes: await readFile(resolved) };
}

function tilesetFilename(root: string, sourcePath: string): string {
  const digest = createHash("sha256").update(relative(root, sourcePath)).digest("hex").slice(0, 12);
  const base = basename(sourcePath, extname(sourcePath))
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 120);
  return `${digest}-${base || "tile"}.png`;
}

async function copyTilesetImages(
  map: Record<string, unknown>,
  root: string,
  outputDirectory: string,
  files: Record<string, Buffer>,
  copied: Map<string, string>,
): Promise<void> {
  if (!Array.isArray(map.tilesets)) throw new TiledSourceError("Tiled export has no tileset list.");
  for (const rawTileset of map.tilesets) {
    if (typeof rawTileset !== "object" || rawTileset === null) {
      throw new TiledSourceError("Tiled export contains an invalid tileset.");
    }
    const tileset = rawTileset as Record<string, unknown>;
    if ("source" in tileset) {
      throw new TiledSourceError("Tiled left an external tileset reference after embedded export.");
    }
    const copyImage = async (owner: Record<string, unknown>): Promise<void> => {
      if (!("image" in owner)) return;
      if (typeof owner.image !== "string" || !owner.image.toLowerCase().endsWith(".png")) {
        throw new TiledSourceError("Every Tiled tileset image must be a PNG.");
      }
      const source = await sourceFile(root, resolve(outputDirectory, owner.image));
      let destination = copied.get(source.path);
      if (destination === undefined) {
        destination = tilesetFilename(root, source.path);
        copied.set(source.path, destination);
        files[`tilesets/${destination}`] = source.bytes;
      }
      owner.image = `../tilesets/${destination}`;
    };
    await copyImage(tileset);
    if (!("tiles" in tileset)) continue;
    if (!Array.isArray(tileset.tiles))
      throw new TiledSourceError("Tiled export contains an invalid tile list.");
    for (const rawTile of tileset.tiles) {
      if (typeof rawTile !== "object" || rawTile === null) {
        throw new TiledSourceError("Tiled export contains an invalid collection tile.");
      }
      await copyImage(rawTile as Record<string, unknown>);
    }
  }
}

async function copyFigures(root: string, files: Record<string, Buffer>): Promise<void> {
  const candidates = (await walkFiles(root)).filter((path) => basename(path) === "metadata.json");
  const figures: { id: string; metadata: string }[] = [];
  const ids = new Set<string>();
  for (const path of candidates) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    } catch (error) {
      if (error instanceof SyntaxError) continue;
      throw error;
    }
    if (typeof raw !== "object" || raw === null || !("states" in raw)) continue;
    const parsed = pixelLabMetadataSchema.safeParse(raw);
    if (!parsed.success) {
      throw new TiledSourceError(
        `PixelLab figure metadata ${relative(root, path)} is invalid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
      );
    }
    const id = basename(dirname(path));
    if (!MAP_ID.test(id)) {
      throw new TiledSourceError(
        `Figure folder ${relative(root, dirname(path))} must have a valid world id.`,
      );
    }
    if (ids.has(id)) throw new TiledSourceError(`More than one PixelLab figure has the id ${id}.`);
    ids.add(id);

    const metadataFile = await sourceFile(root, path);
    const folder = dirname(path);
    const state = parsed.data.states[0];
    if (state === undefined) throw new TiledSourceError(`Figure ${id} has no state.`);
    const frameNames: string[] = [
      ...WORLD_DIRECTIONS.map((direction) => state.frames.rotations[direction]),
      ...WORLD_DIRECTIONS.flatMap((direction) => state.frames.animations.walking[direction]),
    ];
    const uniqueFrameNames = new Set(frameNames);
    files[`avatar/${id}/metadata.json`] = metadataFile.bytes;
    for (const frame of uniqueFrameNames) {
      if (frame.includes("\\") || isAbsolute(frame) || frame.split("/").includes("..")) {
        throw new TiledSourceError(`Figure ${id} names a frame outside its folder.`);
      }
      const sourcePath = resolve(folder, frame);
      const relativePath = relative(folder, sourcePath);
      if (
        relativePath.startsWith(`..${sep}`) ||
        relativePath === ".." ||
        isAbsolute(relativePath)
      ) {
        throw new TiledSourceError(`Figure ${id} names a frame outside its folder.`);
      }
      const image = await sourceFile(root, sourcePath);
      files[`avatar/${id}/${relativePath.split(sep).join("/")}`] = image.bytes;
    }
    figures.push({ id, metadata: `${id}/metadata.json` });
  }
  if (figures.length === 0) {
    throw new TiledSourceError("No PixelLab figure metadata was found in the configured source.");
  }
  files["avatar/figures.json"] = Buffer.from(JSON.stringify({ figures }));
}

export async function exportTiledSource(startMap: string): Promise<Buffer> {
  const root = await resolveTiledSourceRoot();
  const project = await findTiledProject(root);
  const maps = await listMaps(project);
  if (!maps.has(startMap)) {
    throw new TiledSourceError(`Start map ${startMap} is not in the configured Tiled source.`);
  }
  await verifyTiledVersion();

  const temp = await mkdtemp(join(tmpdir(), "zappaloo-tiled-preview-"));
  try {
    const files: Record<string, Buffer> = {};
    const copiedImages = new Map<string, string>();
    let tileWidth: number | undefined;
    let tileHeight: number | undefined;
    for (const [id, sourceMap] of maps) {
      const outputPath = join(temp, `${id}.json`);
      await runTiledExport(project, sourceMap, outputPath);
      let map: unknown;
      try {
        map = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
      } catch (error) {
        throw new TiledSourceError(
          `Tiled produced invalid JSON for ${relative(project.root, sourceMap)}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (typeof map !== "object" || map === null || Array.isArray(map)) {
        throw new TiledSourceError(`Tiled export for ${id} is not a map object.`);
      }
      const exported = map as Record<string, unknown>;
      if (
        typeof exported.tilewidth !== "number" ||
        typeof exported.tileheight !== "number" ||
        typeof exported.orientation !== "string"
      ) {
        throw new TiledSourceError(`Tiled export for ${id} has no map dimensions or orientation.`);
      }
      tileWidth ??= exported.tilewidth;
      tileHeight ??= exported.tileheight;
      if (tileWidth !== exported.tilewidth || tileHeight !== exported.tileheight) {
        throw new TiledSourceError(
          "All maps in one preview world must use the same tile width and height.",
        );
      }
      await copyTilesetImages(exported, root, dirname(outputPath), files, copiedImages);
      files[`maps/${id}.json`] = Buffer.from(JSON.stringify(exported));
    }

    await copyFigures(root, files);
    const doorJson = resolve(root, "door/door.json");
    try {
      await lstat(doorJson);
      files["door/door.json"] = (await sourceFile(root, doorJson)).bytes;
      for (const name of ["door.png", "door-glimpse.png"]) {
        try {
          const path = resolve(root, "door", name);
          await lstat(path);
          files[`door/${name}`] = (await sourceFile(root, path)).bytes;
        } catch (error) {
          if (!isMissingFile(error)) throw error;
        }
      }
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    function isMissingFile(error: unknown): boolean {
      return (
        typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT"
      );
    }

    if (tileWidth === undefined || tileHeight === undefined)
      throw new Error("No Tiled maps were exported");
    files["manifest.json"] = Buffer.from(
      JSON.stringify({
        kind: "zappaloo-world",
        formatVersion: 2,
        name: "Local Tiled source",
        startMap,
        tileWidth,
        tileHeight,
      }),
    );
    const archive = buildArchive(files);
    const checked = checkWorldPackage(archive);
    if (!checked.ok) {
      throw new TiledSourceError(
        "The exported Tiled source does not pass world validation.",
        checked.findings,
      );
    }
    if (archive.length > WORLD_LIMITS.archiveBytes) {
      throw new TiledSourceError("The exported Tiled source exceeds the world package size limit.");
    }
    return archive;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
