// The findings of the world validator (sw-architecture.md 14.4). Every finding names its file, the map
// object where there is one, and the reason. Errors refuse the package; warnings are listed only.
import type { z } from "zod";

export type WorldFindingSeverity = "error" | "warning";

export type WorldFindingCode =
  // The archive itself (the same as for the theme package)
  | "archive_too_large"
  | "unpacked_too_large"
  | "not_gzip"
  | "not_tar"
  | "entry_type"
  | "entry_path"
  | "entry_duplicate"
  | "too_many_files"
  // The layout and the files
  | "file_not_in_layout"
  | "file_missing"
  | "file_too_large"
  | "file_unreferenced"
  | "json_invalid"
  | "json_too_large"
  | "json_field"
  | "format_version"
  | "image_not_png"
  | "image_size"
  // The maps
  | "map_id"
  | "map_format"
  | "map_layer"
  | "map_tileset"
  | "map_tiles"
  | "map_object"
  | "map_property"
  | "map_reference"
  // The avatar and the door scene
  | "avatar_palette"
  | "avatar_part"
  | "avatar_option"
  | "avatar_sheet"
  | "avatar_template"
  | "door_sheet"
  // Warnings
  | "property_unknown"
  | "map_collision"
  | "tileset_unused"
  | "preset_missing"
  | "preset_minigame";

export interface WorldFinding {
  /** The file of the package the finding is about. */
  file: string;
  /** The map object (its name, or its layer), where there is one. */
  object?: string;
  code: WorldFindingCode;
  severity: WorldFindingSeverity;
  /** The reason in words, for the admin and the maker. */
  detail: string;
}

export function errorFinding(
  file: string,
  code: WorldFindingCode,
  detail: string,
  object?: string,
): WorldFinding {
  return object === undefined
    ? { file, code, severity: "error", detail }
    : { file, object, code, severity: "error", detail };
}

export function warningFinding(
  file: string,
  code: WorldFindingCode,
  detail: string,
  object?: string,
): WorldFinding {
  return object === undefined
    ? { file, code, severity: "warning", detail }
    : { file, object, code, severity: "warning", detail };
}

/** The issues of a Zod error as "path: reason", the field first. */
export function zodDetail(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "(file)"}: ${issue.message}`)
    .join("; ");
}
