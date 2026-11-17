// The finding codes of the package validators (sw-architecture.md 14.4, 19.7). Each code is listed here
// once; the declarative definitions of the packages (theme-v1.ts, world-v2.ts) assign every code to
// exactly one rule, and a test checks that the lists and the definitions agree.

/** The codes of the world package validator. */
export const WORLD_FINDING_CODES = [
  // The archive itself
  "archive_too_large",
  "unpacked_too_large",
  "not_gzip",
  "not_tar",
  "entry_type",
  "entry_path",
  "entry_duplicate",
  "too_many_files",
  // The layout and the files
  "file_not_in_layout",
  "file_missing",
  "file_too_large",
  "file_unreferenced",
  "json_invalid",
  "json_too_large",
  "json_field",
  "format_version",
  "image_not_png",
  "image_size",
  // The maps
  "map_id",
  "map_format",
  "map_layer",
  "map_tileset",
  "map_tiles",
  "map_object",
  "map_guide",
  "map_property",
  "map_reference",
  // The figures and the door scene
  "figure_list",
  "figure_metadata",
  "figure_frame",
  "door_sheet",
  // Warnings of the package
  "property_unknown",
  "map_collision",
  "portal_no_target",
  "tileset_unused",
  // Checked at import, against the installation (MAP-08)
  "preset_missing",
  "preset_minigame",
  "action_dropped",
] as const;
export type WorldFindingCode = (typeof WORLD_FINDING_CODES)[number];

/** The codes of the theme package validator. */
export const THEME_FINDING_CODES = [
  "archive_too_large",
  "unpacked_too_large",
  "not_gzip",
  "not_tar",
  "entry_type",
  "entry_path",
  "entry_duplicate",
  "too_many_files",
  "file_not_in_layout",
  "file_missing",
  "json_invalid",
  "json_field",
  "format_version",
  "icon_not_png",
  "icon_size",
  "font_not_woff2",
  "font_too_large",
  "font_count",
  "font_unreferenced",
  "font_missing",
  "contrast",
] as const;
export type ThemeFindingCode = (typeof THEME_FINDING_CODES)[number];
