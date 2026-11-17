import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ALL_DEFINITIONS } from "../../shared/src/packages/index.ts";
import { testWorldFiles } from "../../backend/src/world/build.ts";
import { exampleFiles } from "../build-example-theme.ts";
import { SCHEMA_FILES, generatedDocuments, generatedSchemas } from "./schemas.ts";

const SCHEMA_DIR = fileURLToPath(new URL("../../schemas", import.meta.url));
const SPEC = fileURLToPath(new URL("../../spec/sw-architecture.md", import.meta.url));

/** The committed schema of a file, as a Zod schema that checks the same rules as the JSON Schema. */
function committed(name: string): z.ZodType {
  const document = JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")) as Parameters<
    typeof z.fromJSONSchema
  >[0];
  return z.fromJSONSchema(document);
}

const json = (bytes: Buffer | undefined): unknown =>
  JSON.parse((bytes ?? Buffer.alloc(0)).toString("utf8")) as unknown;

describe("the JSON Schemas and the documents of the package formats (THM-07, MAP-17)", () => {
  it("[THM-07][MAP-17] each committed file equals the one the platform generates", () => {
    for (const [name, text] of Object.entries(generatedSchemas())) {
      expect(readFileSync(join(SCHEMA_DIR, name), "utf8"), name).toBe(text);
    }
  });

  it("[THM-07][MAP-17] the folder holds exactly the generated files, nothing stale", () => {
    expect(readdirSync(SCHEMA_DIR).sort()).toEqual(Object.keys(generatedSchemas()).sort());
  });

  it("[MAP-17][THM-07] the Markdown documents are build output: one per format version, none committed", () => {
    expect(Object.keys(generatedDocuments()).sort()).toEqual(["theme-v1.md", "world-v2.md"]);
    expect(readdirSync(SCHEMA_DIR).filter((name) => name.endsWith(".md"))).toEqual([]);
  });

  it("[THM-07] the example theme passes the theme schemas", () => {
    const files = exampleFiles();
    expect(committed("theme-manifest.v1.schema.json").safeParse(json(files["manifest.json"])).success).toBe(true);
    expect(committed("theme.v1.schema.json").safeParse(json(files["theme.json"])).success).toBe(true);
  });

  it("[MAP-17] the test world passes the world schemas", () => {
    const files = testWorldFiles();
    expect(committed("world-manifest.v2.schema.json").safeParse(json(files["manifest.json"])).success).toBe(true);
    expect(committed("world-figures.v2.schema.json").safeParse(json(files["avatar/figures.json"])).success).toBe(true);
    const maps = Object.keys(files).filter((path) => path.startsWith("maps/"));
    expect(maps).toHaveLength(3);
    for (const path of maps) {
      expect(committed("world-map.v2.schema.json").safeParse(json(files[path])).success, path).toBe(true);
    }
  });

  it("[MAP-17] a schema refuses a manifest with an unknown field, as the validator does", () => {
    const manifest = { ...(json(testWorldFiles()["manifest.json"]) as object), extra: true };
    expect(committed("world-manifest.v2.schema.json").safeParse(manifest).success).toBe(false);
  });

  it("[MAP-17] a schema refuses a map that is not isometric", () => {
    const map = { ...(json(testWorldFiles()["maps/kirche.json"]) as object), orientation: "orthogonal" };
    expect(committed("world-map.v2.schema.json").safeParse(map).success).toBe(false);
  });

  it("[MAP-16][THM-03] every layout entry names a schema file that exists", () => {
    for (const definition of ALL_DEFINITIONS) {
      for (const entry of definition.layout) {
        if (entry.schemaFile !== undefined) {
          expect(Object.keys(SCHEMA_FILES), entry.path).toContain(entry.schemaFile);
        }
      }
    }
  });

  it("[MAP-17][THM-07] every requirement a rule names exists in the specification", () => {
    const spec = readFileSync(SPEC, "utf8");
    for (const definition of ALL_DEFINITIONS) {
      for (const rule of definition.rules) {
        for (const requirement of rule.requirements) {
          expect(spec, `${rule.id} names ${requirement}`).toContain(`| ${requirement} |`);
        }
      }
    }
  });
});
