// The JSON Schemas of the package formats (sw-architecture.md 19.7, 14.4; THM-07, MAP-17). They are
// generated from the platform's own Zod schemas, so they cannot drift from the validator: the test in
// this folder fails when a committed file differs from what the code generates. Each release attaches
// them as single files, and a project that makes packages pins the version it targets.
import { z } from "zod";
import { themeJsonSchema, themeManifestSchema } from "../../shared/src/theme.ts";
import { tiledMapSchema, worldFiguresSchema, worldManifestSchema } from "../../shared/src/world.ts";
import { PACKAGE_DEFINITIONS } from "../../shared/src/packages/index.ts";
import { renderPackageDocument } from "../../shared/src/packages/markdown.ts";

/** The committed schema files, by name in `schemas/`, with the schema each one describes. */
export const SCHEMA_FILES: Record<string, z.ZodType> = {
  "theme-manifest.v2.schema.json": themeManifestSchema,
  "theme.v2.schema.json": themeJsonSchema,
  "world-manifest.v2.schema.json": worldManifestSchema,
  "world-figures.v2.schema.json": worldFiguresSchema,
  "world-map.v2.schema.json": tiledMapSchema,
};

/** The text of one schema file: JSON, two-space indented, with a final newline. */
export function schemaText(schema: z.ZodType): string {
  const document = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  return `${JSON.stringify(document, null, 2)}\n`;
}

/** Every schema file by its name, as the platform generates it. */
export function generatedSchemas(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SCHEMA_FILES).map(([name, schema]) => [name, schemaText(schema)]),
  );
}

/**
 * The Markdown document of every format version, named `<package>-v<version>.md`, rendered from the
 * declarative definitions (shared/src/packages).
 */
export function generatedDocuments(): Record<string, string> {
  const documents: Record<string, string> = {};
  for (const definition of Object.values(PACKAGE_DEFINITIONS.theme)) {
    documents[`theme-v${String(definition.formatVersion)}.md`] = renderPackageDocument(definition);
  }
  for (const definition of Object.values(PACKAGE_DEFINITIONS.world)) {
    documents[`world-v${String(definition.formatVersion)}.md`] = renderPackageDocument(definition);
  }
  return documents;
}
