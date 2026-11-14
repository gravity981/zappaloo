// The declarative description of a package format version (sw-architecture.md 14.4, 19.7). The
// validators check a package against it, and the Markdown documents of the release are generated from
// it, so the two cannot disagree. A definition is written once per format version and is kept after
// a newer version is published, because the platform keeps reading the versions it lists (THM-02).

/** One file or folder of the layout. Paths are written with their placeholders, e.g. `maps/{id}.json`. */
export interface LayoutEntry {
  /** The path as the document shows it, with placeholders. */
  path: string;
  /** Matches the real paths of the archive (a file, or a folder without its trailing slash). */
  match: RegExp;
  kind: "folder" | "json" | "png" | "woff2" | "tiled-map";
  /** Whether the entry must be in the package (a single file, or at least one for `many`). */
  required: boolean;
  /** Whether the entry may appear more than once, e.g. one file per map. */
  many: boolean;
  /** What the entry is for, in one sentence. */
  purpose: string;
  /** The JSON Schema file in `schemas/` that describes a JSON file, if there is one. */
  schemaFile?: string;
  /** The exact pixel size of a PNG, if it is fixed. */
  size?: { width: number; height: number };
  /** The size of a PNG as text, when it follows from other fields of the package. */
  sizeNote?: string;
}

/** A rule of the validator, or a check made at import against the installation. */
export interface RuleDefinition<Code extends string> {
  /** A stable id, e.g. `archive.size`. Findings carry it in `--json` output. */
  id: string;
  /** `validator`: part of `zappaloo validate`; `installation`: checked at import (MAP-08). */
  scope: "validator" | "installation";
  severity: "error" | "warning";
  /** The requirements the rule verifies (IDs of sw-architecture.md). */
  requirements: string[];
  /** The rule in words, for the document. */
  text: string;
  /** The finding codes the rule produces. Each code belongs to exactly one rule. */
  codes: Code[];
}

/** A limit of the package, shown in the document with its value. */
export interface LimitEntry {
  label: string;
  value: string;
  requirement: string;
}

/** One entry of the change history of a format version. */
export interface ChangeEntry {
  date: string;
  text: string;
}

export interface PackageDefinition<Code extends string> {
  /** The value of `kind` in `manifest.json`. */
  kind: string;
  formatVersion: number;
  title: string;
  summary: string;
  limits: LimitEntry[];
  layout: LayoutEntry[];
  rules: RuleDefinition<Code>[];
  changes: ChangeEntry[];
}
