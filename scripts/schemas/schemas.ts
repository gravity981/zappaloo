// The JSON Schemas of the package formats (sw-architecture.md 19.7, 14.4; THM-07, MAP-17). They are
// generated from the platform's own Zod schemas, so they cannot drift from the validator: the test in
// this folder fails when a committed file differs from what the code generates. Each release attaches
// them as single files, and a project that makes packages pins the version it targets.
import { z } from "zod";
import { themeJsonSchema, themeManifestSchema } from "../../shared/src/theme.ts";
import { tiledMapSchema, worldAvatarSchema, worldManifestSchema } from "../../shared/src/world.ts";

/** The committed schema files, by name in `schemas/`, with the schema each one describes. */
export const SCHEMA_FILES: Record<string, z.ZodType> = {
  "theme-manifest.v1.schema.json": themeManifestSchema,
  "theme.v1.schema.json": themeJsonSchema,
  "world-manifest.v1.schema.json": worldManifestSchema,
  "world-avatar.v1.schema.json": worldAvatarSchema,
  "world-map.v1.schema.json": tiledMapSchema,
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
