// The door scene of the world package (sw-architecture.md 10.4, 14.4): `door/door.json` and its sprite
// sheet `door/door.png`, and the optional `door/door-glimpse.png`. Without the folder the built-in
// scene applies, so the folder is optional as a whole.
import { doorSheetSchema } from "@zappaloo/shared";
import type { DoorSheet } from "@zappaloo/shared";
import type { PngSize } from "../packages/png.ts";
import { errorFinding, zodDetail } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

export interface DoorResult {
  /** Present when the package has a door scene that is valid. */
  door?: { sheet: DoorSheet; glimpse: boolean };
  findings: WorldFinding[];
}

/** Checks the door folder; a package without it gets no findings and no door scene. */
export function checkDoor(files: Map<string, Buffer>, images: Map<string, PngSize>): DoorResult {
  const present = [...files.keys()].some((path) => path.startsWith("door/"));
  if (!present) return { findings: [] };
  const findings: WorldFinding[] = [];

  for (const path of ["door/door.json", "door/door.png"]) {
    if (!files.has(path)) findings.push(errorFinding(path, "file_missing", "the file is missing"));
  }
  const json = files.get("door/door.json");
  let sheet: DoorSheet | undefined;
  if (json !== undefined) {
    let raw: unknown;
    try {
      raw = JSON.parse(json.toString("utf8")) as unknown;
    } catch {
      findings.push(errorFinding("door/door.json", "json_invalid", "not valid JSON"));
    }
    if (raw !== undefined) {
      const parsed = doorSheetSchema.safeParse(raw);
      if (parsed.success) sheet = parsed.data;
      else findings.push(errorFinding("door/door.json", "json_field", zodDetail(parsed.error)));
    }
  }

  // The sheet holds exactly `frames` frames of the frame size, side by side.
  const size = images.get("door/door.png");
  if (sheet !== undefined && size !== undefined) {
    const width = sheet.frames * sheet.frameWidth;
    if (size.width !== width || size.height !== sheet.frameHeight) {
      findings.push(
        errorFinding(
          "door/door.png",
          "door_sheet",
          `the sheet is ${String(size.width)} × ${String(size.height)} instead of ${String(width)} × ${String(sheet.frameHeight)} (${String(sheet.frames)} frames)`,
        ),
      );
    }
  }

  if (findings.length > 0 || sheet === undefined) return { findings };
  return { door: { sheet, glimpse: files.has("door/door-glimpse.png") }, findings };
}
