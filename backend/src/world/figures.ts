// The figures of the world package (sw-architecture.md 14.4, 7.3, MAP-16, AVA-01, AVA-02): `avatar/figures.json`
// lists the complete figures a guest can choose; each figure's PixelLab metadata names its canvas and its
// frames, which the package holds unchanged. The validator checks the list, the metadata, every frame
// and that every file of avatar/ is named by a figure.
import { posix } from "node:path";
import {
  pixelLabMetadataSchema,
  WORLD_DIRECTIONS,
  WORLD_LIMITS,
  worldFiguresSchema,
} from "@zappaloo/shared";
import type { WorldFigure } from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

const FIGURES_FILE = "avatar/figures.json";

export interface FiguresResult {
  /** The figures, when the list and every figure are valid. */
  figures?: WorldFigure[];
  findings: WorldFinding[];
}

/** Whether a zod issue list says a field is unknown (refused, 14.4). */
function hasUnknownKeys(issues: { code: string }[]): boolean {
  return issues.some((issue) => issue.code === "unrecognized_keys");
}

/** Checks `avatar/figures.json`, every figure's metadata and frames, and the files of avatar/. */
export function checkFigures(
  files: Map<string, Buffer>,
  images: Map<string, PngSize>,
): FiguresResult {
  const findings: WorldFinding[] = [];
  const bytes = files.get(FIGURES_FILE);
  if (bytes === undefined) {
    findings.push(errorFinding(FIGURES_FILE, "file_missing", "the file is missing"));
    return { findings };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push(errorFinding(FIGURES_FILE, "json_invalid", "not valid JSON"));
    return { findings };
  }
  const parsed = worldFiguresSchema.safeParse(raw);
  if (!parsed.success) {
    const code = hasUnknownKeys(parsed.error.issues) ? "json_field" : "figure_list";
    findings.push(errorFinding(FIGURES_FILE, code, zodDetail(parsed.error)));
    return { findings };
  }

  const figures = parsed.data.figures;
  // Every guest (vip) chooses from tier1: a world without such a figure leaves them nothing (7.3).
  if (!figures.some((figure) => figure.tier === "tier1")) {
    findings.push(
      errorFinding(
        FIGURES_FILE,
        "figure_list",
        "at least one figure must be tier1, for the guests",
      ),
    );
  }
  const ids = new Set<string>();
  const referenced = new Set<string>([FIGURES_FILE]);
  for (const figure of figures) {
    if (ids.has(figure.id)) {
      findings.push(
        errorFinding(FIGURES_FILE, "figure_list", `figure ${figure.id} is listed twice`, figure.id),
      );
    }
    ids.add(figure.id);
    for (const path of checkFigure(figure, files, images, findings)) referenced.add(path);
  }

  // Every PNG and metadata file of avatar/ is named by a figure (14.4).
  for (const path of files.keys()) {
    if (!path.startsWith("avatar/") || referenced.has(path)) continue;
    findings.push(errorFinding(path, "file_unreferenced", "no figure names the file"));
  }

  if (findings.some((finding) => finding.severity === "error")) return { findings };
  return { figures, findings };
}

/**
 * One figure: its metadata exists, is a PixelLab metadata, names a canvas within the limits, and lists
 * frames that exist, have the canvas size and whose walk has the same number of frames in each direction.
 * Returns the paths of the files it names (its metadata and every frame).
 */
function checkFigure(
  figure: WorldFigure,
  files: Map<string, Buffer>,
  images: Map<string, PngSize>,
  findings: WorldFinding[],
): string[] {
  const metadataPath = `avatar/${figure.metadata}`;
  const label = figure.id;
  const named = [metadataPath];
  const bytes = files.get(metadataPath);
  if (bytes === undefined) {
    findings.push(
      errorFinding(metadataPath, "file_missing", `the metadata of ${label} is missing`, label),
    );
    return named;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push(errorFinding(metadataPath, "json_invalid", "not valid JSON", label));
    return named;
  }
  const parsed = pixelLabMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    findings.push(errorFinding(metadataPath, "figure_metadata", zodDetail(parsed.error), label));
    return named;
  }
  const state = parsed.data.states[0];
  if (state === undefined) return named;
  const { width, height } = state.character.size;
  const side = WORLD_LIMITS.figureFrameSide;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < side.min ||
    height < side.min ||
    width > side.max ||
    height > side.max
  ) {
    findings.push(
      errorFinding(
        metadataPath,
        "figure_frame",
        `the canvas is ${String(width)} × ${String(height)}; a side is ${String(side.min)} to ${String(side.max)} pixels`,
        label,
      ),
    );
    return named;
  }

  const folder = posix.dirname(metadataPath);
  const check = (frame: string): void => {
    const path = posix.normalize(posix.join(folder, frame));
    named.push(path);
    if (path.startsWith("../") || !path.startsWith(`${folder}/`)) {
      findings.push(
        errorFinding(
          metadataPath,
          "figure_frame",
          `the frame ${frame} is outside the figure's folder`,
          label,
        ),
      );
      return;
    }
    if (!files.has(path)) {
      findings.push(
        errorFinding(path, "file_missing", `the frame ${frame} of ${label} is missing`, label),
      );
      return;
    }
    const size = images.get(path);
    if (size !== undefined && (size.width !== width || size.height !== height)) {
      findings.push(
        errorFinding(
          path,
          "figure_frame",
          `the frame is ${String(size.width)} × ${String(size.height)}; the canvas is ${String(width)} × ${String(height)}`,
          label,
        ),
      );
    }
  };

  for (const direction of WORLD_DIRECTIONS) {
    check(state.frames.rotations[direction]);
  }
  const walking = state.frames.animations.walking;
  const counts = WORLD_DIRECTIONS.map((direction) => walking[direction].length);
  const walkFrames = WORLD_LIMITS.walkFrames;
  const count = counts[0] ?? 0;
  if (counts.some((value) => value !== count) || count < walkFrames.min || count > walkFrames.max) {
    findings.push(
      errorFinding(
        metadataPath,
        "figure_frame",
        `the walk has ${counts.join(", ")} frames; each direction needs the same number, ${String(walkFrames.min)} to ${String(walkFrames.max)}`,
        label,
      ),
    );
  }
  for (const direction of WORLD_DIRECTIONS) {
    for (const frame of walking[direction]) check(frame);
  }
  return named;
}
