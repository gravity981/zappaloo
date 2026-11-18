// The validator of the world package (sw-architecture.md 14.4, MAP-06, MAP-17). It checks the whole
// package before anything changes and returns every finding with its file and reason. A package with
// an error is refused; warnings are listed with it. Nothing is imported from here.
import { WORLD_FORMAT_VERSIONS, WORLD_LIMITS, worldManifestSchema } from "@zappaloo/shared";
import type { DoorSheet, WorldFigure, WorldManifest } from "@zappaloo/shared";
import { pngSize } from "../packages/png.ts";
import type { PngSize } from "../packages/png.ts";
import { megabytes, readPackageArchive, TarError } from "../packages/archive.ts";
import { checkFigures } from "./figures.ts";
import { checkDoor } from "./door.ts";
import { errorFinding, warningFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";
import { worldV2, worldV3 } from "@zappaloo/shared";
import { checkBird } from "./bird.ts";
import { checkMap, checkMapReferences } from "./maps.ts";
import type { MapInfo } from "./maps.ts";

/** A package the platform would accept: its parts, checked. */
export interface WorldPackage {
  manifest: WorldManifest;
  /** The figures a guest can choose, in the order of `figures.json`. */
  figures: WorldFigure[];
  /** The door scene of the package, when it has one. */
  door?: { sheet: DoorSheet; glimpse: boolean };
  /** The ids of the maps (the names of the files in `maps/`). */
  mapIds: string[];
  /** Every file of the package by its path. */
  files: Map<string, Buffer>;
}

export type WorldCheck =
  | { ok: true; package: WorldPackage; findings: WorldFinding[] }
  | { ok: false; findings: WorldFinding[] };

/**
 * Whether a path is part of the layout of a format version (14.4): an entry of the definition of its kind
 * matches it. Folders and files are matched by their own entries, because a folder pattern also matches
 * the paths below it. A version that is not known is checked against the newest layout.
 */
export function inWorldLayout(
  path: string,
  kind: "file" | "folder" = "file",
  version = 3,
): boolean {
  const definition = version === 2 ? worldV2 : worldV3;
  return definition.layout.some(
    (entry) => (entry.kind === "folder") === (kind === "folder") && entry.match.test(path),
  );
}

/** The format version a manifest names: 2 or 3; anything else (or no manifest) counts as the newest. */
function versionOf(entry: { kind: string; data?: Buffer } | undefined): number {
  if (entry?.data === undefined) return 3;
  try {
    const raw = JSON.parse(entry.data.toString("utf8")) as unknown;
    const version =
      typeof raw === "object" && raw !== null && "formatVersion" in raw
        ? raw.formatVersion
        : undefined;
    return version === 2 ? 2 : 3;
  } catch {
    return 3;
  }
}

/** Reads one JSON file of the package, recording a finding when it is missing or not JSON. */
function readJson(name: string, files: Map<string, Buffer>, findings: WorldFinding[]): unknown {
  const bytes = files.get(name);
  if (bytes === undefined) {
    findings.push(errorFinding(name, "file_missing", "the file is missing"));
    return undefined;
  }
  try {
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push(errorFinding(name, "json_invalid", "not valid JSON"));
    return undefined;
  }
}

/** Checks a whole world package. */
export function checkWorldPackage(archive: Buffer): WorldCheck {
  if (archive.length > WORLD_LIMITS.archiveBytes) {
    return {
      ok: false,
      findings: [
        errorFinding(
          "(archive)",
          "archive_too_large",
          `larger than ${megabytes(WORLD_LIMITS.archiveBytes)} MB`,
        ),
      ],
    };
  }
  let entries;
  try {
    entries = readPackageArchive(archive, {
      unpackedBytes: WORLD_LIMITS.unpackedBytes,
      maxEntries: WORLD_LIMITS.files,
    });
  } catch (error) {
    if (error instanceof TarError) {
      return { ok: false, findings: [errorFinding(error.file, error.code, error.message)] };
    }
    throw error;
  }

  // The format version decides which layout and which rules apply, so it is read before the files are sorted.
  const version = versionOf(entries.find((entry) => entry.path === "manifest.json"));
  const findings: WorldFinding[] = [];
  const files = new Map<string, Buffer>();
  for (const entry of entries) {
    if (entry.kind === "directory") {
      if (!inWorldLayout(entry.path, "folder", version)) {
        findings.push(errorFinding(entry.path, "file_not_in_layout", "not part of the layout"));
      }
      continue;
    }
    if (!inWorldLayout(entry.path, "file", version)) {
      findings.push(errorFinding(entry.path, "file_not_in_layout", "not part of the layout"));
      continue;
    }
    files.set(entry.path, entry.data);
  }

  // Sizes and images: every JSON file is at most 5 MB, every PNG at most 8 MB and 4096 pixels a side.
  const images = new Map<string, PngSize>();
  for (const [path, data] of files) {
    if (path.endsWith(".json")) {
      if (data.length > WORLD_LIMITS.jsonBytes) {
        findings.push(
          errorFinding(
            path,
            "json_too_large",
            `larger than ${megabytes(WORLD_LIMITS.jsonBytes)} MB`,
          ),
        );
      }
      continue;
    }
    if (data.length > WORLD_LIMITS.imageBytes) {
      findings.push(
        errorFinding(
          path,
          "file_too_large",
          `larger than ${megabytes(WORLD_LIMITS.imageBytes)} MB`,
        ),
      );
    }
    const size = pngSize(data);
    if (size === undefined) {
      findings.push(errorFinding(path, "image_not_png", "not a PNG image"));
      continue;
    }
    images.set(path, size);
    if (size.width > WORLD_LIMITS.imageSide || size.height > WORLD_LIMITS.imageSide) {
      findings.push(
        errorFinding(
          path,
          "image_size",
          `${String(size.width)} × ${String(size.height)} pixels; at most ${String(WORLD_LIMITS.imageSide)} × ${String(WORLD_LIMITS.imageSide)}`,
        ),
      );
    }
  }

  // manifest.json: the format version first, so an unknown version gets its own finding.
  const rawManifest = readJson("manifest.json", files, findings);
  let manifest: WorldManifest | undefined;
  if (rawManifest !== undefined) {
    const version =
      typeof rawManifest === "object" && rawManifest !== null && "formatVersion" in rawManifest
        ? rawManifest.formatVersion
        : undefined;
    if (version !== undefined && !WORLD_FORMAT_VERSIONS.some((known) => known === version)) {
      findings.push(
        errorFinding(
          "manifest.json",
          "format_version",
          `format version ${JSON.stringify(version)} is not read by the platform`,
        ),
      );
    } else {
      const parsed = worldManifestSchema.safeParse(rawManifest);
      if (parsed.success) manifest = parsed.data;
      else findings.push(errorFinding("manifest.json", "json_field", zodDetail(parsed.error)));
    }
  }

  const figureCheck = checkFigures(files, images);
  findings.push(...figureCheck.findings);
  const figures = figureCheck.figures;

  // The maps, each on its own, then the references between them.
  const mapPaths = [...files.keys()].filter((path) => path.startsWith("maps/"));
  if (mapPaths.length === 0) {
    findings.push(errorFinding("maps/", "file_missing", "the package holds no map"));
  }
  const mapIds = mapPaths.map((path) => path.slice("maps/".length, -".json".length));
  const infos: MapInfo[] = [];
  for (const path of mapPaths) {
    const id = path.slice("maps/".length, -".json".length);
    const bytes = files.get(path) ?? Buffer.alloc(0);
    const result = checkMap(id, bytes, {
      tileWidth: manifest?.tileWidth,
      tileHeight: manifest?.tileHeight,
      files,
      images,
      formatVersion: manifest?.formatVersion ?? version,
    });
    findings.push(...result.findings);
    if (result.info !== undefined) infos.push(result.info);
  }
  findings.push(...checkMapReferences(infos, manifest?.startMap, mapIds));

  // Tilesets that no map uses; reported only when every map could be read.
  if (infos.length === mapPaths.length) {
    const used = new Set(infos.flatMap((info) => [...info.tilesetImages]));
    for (const path of files.keys()) {
      if (!path.startsWith("tilesets/")) continue;
      const name = path.slice("tilesets/".length, -".png".length);
      if (!used.has(name)) {
        findings.push(warningFinding(path, "tileset_unused", "no map uses this image"));
      }
    }
  }

  // The bird belongs to format version 3; in version 2 the folder `ambient/` is not part of the layout.
  if (version >= 3) findings.push(...checkBird(files, images).findings);

  const door = checkDoor(files, images);
  findings.push(...door.findings);

  const failed = findings.some((finding) => finding.severity === "error");
  if (failed || manifest === undefined || figures === undefined) {
    return { ok: false, findings };
  }
  return {
    ok: true,
    package: {
      manifest,
      figures,
      door: door.door,
      mapIds: infos.map((info) => info.id),
      files,
    },
    findings,
  };
}
