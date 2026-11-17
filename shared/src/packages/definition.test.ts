import { describe, expect, it } from "vitest";
import { THEME_KIND, WORLD_KIND } from "../index.ts";
import { THEME_FORMAT_VERSIONS, WORLD_FORMAT_VERSIONS } from "../index.ts";
import {
  PACKAGE_DEFINITIONS,
  THEME_FINDING_CODES,
  WORLD_FINDING_CODES,
  themeV1,
  worldV2,
} from "./index.ts";
import type { PackageDefinition } from "./definition.ts";
import { renderPackageDocument } from "./markdown.ts";

/** The codes of every rule of a definition, in order. */
const ruleCodes = (definition: PackageDefinition<string>): string[] =>
  definition.rules.flatMap((rule) => rule.codes);

describe("the package definitions (THM-02, MAP-16, MAP-17)", () => {
  it("[MAP-17][THM-07] every world finding code belongs to exactly one rule of the world definition", () => {
    const codes = ruleCodes(worldV2);
    expect([...new Set(codes)].length).toBe(codes.length);
    expect([...codes].sort()).toEqual([...WORLD_FINDING_CODES].sort());
  });

  it("[MAP-17][THM-07] every theme finding code belongs to exactly one rule of the theme definition", () => {
    const codes = ruleCodes(themeV1);
    expect([...new Set(codes)].length).toBe(codes.length);
    expect([...codes].sort()).toEqual([...THEME_FINDING_CODES].sort());
  });

  it("[THM-02][MAP-16] each definition names the kind and the format version the platform reads", () => {
    expect(worldV2.kind).toBe(WORLD_KIND);
    expect(themeV1.kind).toBe(THEME_KIND);
    expect(WORLD_FORMAT_VERSIONS).toContain(worldV2.formatVersion);
    expect(THEME_FORMAT_VERSIONS).toContain(themeV1.formatVersion);
    expect(Object.keys(PACKAGE_DEFINITIONS.world)).toEqual([String(worldV2.formatVersion)]);
    expect(Object.keys(PACKAGE_DEFINITIONS.theme)).toEqual([String(themeV1.formatVersion)]);
  });

  it("[MAP-17][THM-07] rule ids are unique, and every rule names at least one requirement that has the spec's form", () => {
    for (const definition of [worldV2, themeV1]) {
      const ids = definition.rules.map((rule) => rule.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const rule of definition.rules) {
        expect(rule.requirements.length, rule.id).toBeGreaterThan(0);
        for (const requirement of rule.requirements) {
          expect(requirement, rule.id).toMatch(/^[A-Z]{2,4}-\d{2}$/);
        }
      }
    }
  });

  it("[MAP-16][THM-03] the layout entries match the paths they describe and nothing else", () => {
    const worldPaths = [
      ["manifest.json", true],
      ["maps", true],
      ["maps/kirche.json", true],
      ["maps/kirche.tmx", false],
      ["maps/sub/kirche.json", false],
      ["tilesets/boden.png", true],
      ["tilesets/boden.tsx", false],
      ["tilesets/a b.png", false],
      ["avatar/figures.json", true],
      ["avatar/wedding-guest/metadata.json", true],
      ["avatar/wedding-guest/Idle/rotations/south.png", true],
      ["avatar/wedding-guest/Idle/animations/walking/south/frame_000.png", true],
      ["avatar/avatar.json", false],
      ["avatar/body.png", false],
      ["door/door.json", true],
      ["door/door-glimpse.png", true],
      ["door/sub.png", false],
      ["notes.txt", false],
    ] as const;
    for (const [path, expected] of worldPaths) {
      const folder = ["maps", "tilesets", "avatar", "door"].includes(path);
      const matched = worldV2.layout.some(
        (entry) => (entry.kind === "folder") === folder && entry.match.test(path),
      );
      expect(matched, path).toBe(expected);
    }
    const themePaths = [
      ["manifest.json", true],
      ["icons/icon-192.png", true],
      ["icons/icon-maskable-512.png", true],
      ["fonts/lora-400.woff2", true],
      ["fonts/lora.ttf", false],
      ["icons/other.png", false],
    ] as const;
    for (const [path, expected] of themePaths) {
      const matched = themeV1.layout.some((entry) => entry.match.test(path));
      expect(matched, path).toBe(expected);
    }
  });

  it("[MAP-16] every rendered document names every rule and every layout entry", () => {
    for (const definition of [worldV2, themeV1]) {
      const text = renderPackageDocument(definition);
      for (const rule of definition.rules) expect(text, rule.id).toContain(`\`${rule.id}\``);
      for (const entry of definition.layout) expect(text, entry.path).toContain(entry.path);
    }
  });
});
