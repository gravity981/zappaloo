import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testWorldFiles } from "../../backend/src/world/build.ts";
import { exampleFiles } from "../build-example-theme.ts";
import { generatedSchemas } from "./schemas.ts";

const SCHEMA_DIR = fileURLToPath(new URL("../../schemas", import.meta.url));

/** The committed schema of a file, as a Zod schema that checks the same rules as the JSON Schema. */
function committed(name: string): z.ZodType {
  const document = JSON.parse(readFileSync(join(SCHEMA_DIR, name), "utf8")) as Parameters<
    typeof z.fromJSONSchema
  >[0];
  return z.fromJSONSchema(document);
}

const json = (bytes: Buffer | undefined): unknown =>
  JSON.parse((bytes ?? Buffer.alloc(0)).toString("utf8")) as unknown;

describe("the JSON Schemas of the package formats (THM-07, MAP-17)", () => {
  it("[THM-07][MAP-17] each committed schema equals the one the platform generates", () => {
    for (const [name, text] of Object.entries(generatedSchemas())) {
      expect(readFileSync(join(SCHEMA_DIR, name), "utf8"), name).toBe(text);
    }
  });

  it("[THM-07] the example theme passes the theme schemas", () => {
    const files = exampleFiles();
    expect(
      committed("theme-manifest.v1.schema.json").safeParse(json(files["manifest.json"])).success,
    ).toBe(true);
    expect(committed("theme.v1.schema.json").safeParse(json(files["theme.json"])).success).toBe(
      true,
    );
  });

  it("[MAP-17] the test world passes the world schemas", () => {
    const files = testWorldFiles();
    expect(
      committed("world-manifest.v1.schema.json").safeParse(json(files["manifest.json"])).success,
    ).toBe(true);
    expect(
      committed("world-avatar.v1.schema.json").safeParse(json(files["avatar/avatar.json"])).success,
    ).toBe(true);
    const maps = Object.keys(files).filter((path) => path.startsWith("maps/"));
    expect(maps).toHaveLength(3);
    for (const path of maps) {
      expect(committed("world-map.v1.schema.json").safeParse(json(files[path])).success, path).toBe(
        true,
      );
    }
  });

  it("[MAP-17] a schema refuses a manifest with an unknown field, as the validator does", () => {
    const manifest = { ...(json(testWorldFiles()["manifest.json"]) as object), extra: true };
    expect(committed("world-manifest.v1.schema.json").safeParse(manifest).success).toBe(false);
  });

  it("[MAP-17] a schema refuses a map that is not orthogonal", () => {
    const map = {
      ...(json(testWorldFiles()["maps/kirche.json"]) as object),
      orientation: "isometric",
    };
    expect(committed("world-map.v1.schema.json").safeParse(map).success).toBe(false);
  });
});
