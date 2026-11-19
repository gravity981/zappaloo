// The bird of the world package, format version 3 (sw-architecture.md 14.4, MAP-20, GAME-32): the optional
// `ambient/bird/metadata.json` is a PixelLab metadata file like a figure's, with the animation `flying` in place of
// `walking`. Without it there are no birds. The validator checks the metadata, every frame and that every file of
// `ambient/` is named by the metadata.
import { posix } from "node:path";
import {
  pixelLabBirdSchema,
  WORLD_BIRD_METADATA,
  WORLD_DIRECTIONS,
  WORLD_FILE_SEGMENT,
  WORLD_LIMITS,
} from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

const LABEL = "bird";

/** Checks the bird of a package of format version 3 and the files of `ambient/`. */
export function checkBird(
  files: Map<string, Buffer>,
  images: Map<string, PngSize>,
): { findings: WorldFinding[] } {
  const findings: WorldFinding[] = [];
  const bytes = files.get(WORLD_BIRD_METADATA);
  const ambient = [...files.keys()].filter((path) => path.startsWith("ambient/"));
  if (bytes === undefined) {
    // Frames without their metadata name nothing: they are not part of any bird.
    for (const path of ambient) {
      findings.push(errorFinding(path, "file_unreferenced", "no bird names the file"));
    }
    return { findings };
  }
  const named = new Set<string>([WORLD_BIRD_METADATA]);
  let raw: unknown;
  try {
    raw = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch {
    findings.push(errorFinding(WORLD_BIRD_METADATA, "json_invalid", "not valid JSON", LABEL));
    return { findings };
  }
  const parsed = pixelLabBirdSchema.safeParse(raw);
  if (!parsed.success) {
    findings.push(
      errorFinding(WORLD_BIRD_METADATA, "bird_metadata", zodDetail(parsed.error), LABEL),
    );
    return { findings };
  }
  const state = parsed.data.states[0];
  if (state === undefined) return { findings };
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
        WORLD_BIRD_METADATA,
        "bird_frame",
        `the canvas is ${String(width)} × ${String(height)}; a side is ${String(side.min)} to ${String(side.max)} pixels`,
        LABEL,
      ),
    );
    return { findings };
  }

  const folder = posix.dirname(WORLD_BIRD_METADATA);
  const check = (frame: string): void => {
    const path = posix.normalize(posix.join(folder, frame));
    named.add(path);
    if (path.startsWith("../") || !path.startsWith(`${folder}/`)) {
      findings.push(
        errorFinding(
          WORLD_BIRD_METADATA,
          "bird_frame",
          `the frame ${frame} is outside the bird's folder`,
          LABEL,
        ),
      );
      return;
    }
    if (
      !frame.endsWith(".png") ||
      !frame.split("/").every((part) => WORLD_FILE_SEGMENT.test(part))
    ) {
      findings.push(
        errorFinding(
          path,
          "bird_frame",
          `the frame ${frame} of the bird must be a PNG; its name may only have letters, digits, ., _ and -`,
          LABEL,
        ),
      );
      return;
    }
    if (!files.has(path)) {
      findings.push(
        errorFinding(path, "file_missing", `the frame ${frame} of the bird is missing`, LABEL),
      );
      return;
    }
    const size = images.get(path);
    if (size !== undefined && (size.width !== width || size.height !== height)) {
      findings.push(
        errorFinding(
          path,
          "bird_frame",
          `the frame is ${String(size.width)} × ${String(size.height)}; the canvas is ${String(width)} × ${String(height)}`,
          LABEL,
        ),
      );
    }
  };

  for (const direction of WORLD_DIRECTIONS) check(state.frames.rotations[direction]);
  // `east` and `west` are needed; `south` and `north` are checked when they are there.
  const flying = state.frames.animations.flying;
  const lists = (["east", "west", "south", "north"] as const).flatMap((direction) => {
    const list = flying[direction];
    return list === undefined ? [] : [list];
  });
  const counts = lists.map((list) => list.length);
  const frames = WORLD_LIMITS.flyFrames;
  const count = counts[0] ?? 0;
  if (counts.some((value) => value !== count) || count < frames.min || count > frames.max) {
    findings.push(
      errorFinding(
        WORLD_BIRD_METADATA,
        "bird_frame",
        `the flight has ${counts.join(", ")} frames; each direction needs the same number, ${String(frames.min)} to ${String(frames.max)}`,
        LABEL,
      ),
    );
  }
  for (const list of lists) for (const frame of list) check(frame);

  for (const path of ambient) {
    if (!named.has(path)) {
      findings.push(
        errorFinding(path, "file_unreferenced", "the bird's metadata names no such file"),
      );
    }
  }
  return { findings };
}
