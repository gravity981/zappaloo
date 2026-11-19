import { describe, expect, it } from "vitest";
import { THEME_KIND, WORLD_KIND } from "../index.ts";
import { THEME_FORMAT_VERSIONS, WORLD_FORMAT_VERSIONS } from "../index.ts";
import {
  PACKAGE_DEFINITIONS,
  THEME_FINDING_CODES,
  WORLD_FINDING_CODES,
  themeV2,
  worldV2,
  worldV3,
} from "./index.ts";
import type { PackageDefinition } from "./definition.ts";
import { renderPackageDocument } from "./markdown.ts";

/** The codes of every rule of a definition, in order. */
const ruleCodes = (definition: PackageDefinition<string>): string[] =>
  definition.rules.flatMap((rule) => rule.codes);

describe("the package definitions (THM-02, MAP-16, MAP-17)", () => {
  it("[MAP-17][THM-07] every world finding code belongs to exactly one rule of the newest world definition; the older one lacks only the codes of what it does not have", () => {
    const codes = ruleCodes(worldV3);
    expect([...new Set(codes)].length).toBe(codes.length);
    expect([...codes].sort()).toEqual([...WORLD_FINDING_CODES].sort());
    // Format version 2 has no bird, tile animation or path, so no rule for their codes.
    const v2 = ruleCodes(worldV2);
    expect([...new Set(v2)].length).toBe(v2.length);
    expect([...v2].sort()).toEqual(
      WORLD_FINDING_CODES.filter(
        (code) => !code.startsWith("bird_") && code !== "map_animation" && code !== "path_unused",
      ).sort(),
    );
  });

  it("[MAP-17][THM-07] every theme finding code belongs to exactly one rule of the theme definition", () => {
    const codes = ruleCodes(themeV2);
    expect([...new Set(codes)].length).toBe(codes.length);
    expect([...codes].sort()).toEqual([...THEME_FINDING_CODES].sort());
  });

  it("[THM-02][MAP-16] each definition names the kind and the format version the platform reads", () => {
    expect(worldV2.kind).toBe(WORLD_KIND);
    expect(themeV2.kind).toBe(THEME_KIND);
    // The platform reads the world format versions 2 and 3, each with its own definition (MAP-20).
    expect(WORLD_FORMAT_VERSIONS).toEqual([2, 3]);
    expect(worldV3.kind).toBe(WORLD_KIND);
    expect(THEME_FORMAT_VERSIONS).toContain(themeV2.formatVersion);
    expect(Object.keys(PACKAGE_DEFINITIONS.world)).toEqual(["2", "3"]);
    expect(Object.keys(PACKAGE_DEFINITIONS.theme)).toEqual([String(themeV2.formatVersion)]);
  });

  it("[MAP-17][THM-07] rule ids are unique, and every rule names at least one requirement that has the spec's form", () => {
    for (const definition of [worldV2, worldV3, themeV2]) {
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
    // The bird of format version 3 sits in `ambient/bird/`; version 2 has no such folder.
    const birdPaths = [
      ["ambient/bird/metadata.json", true],
      ["ambient/bird/Idle/rotations/east.png", true],
      ["ambient/bird/Idle/animations/flying/east/frame_000.png", true],
      ["ambient/bird/bird.gif", false],
      ["ambient/metadata.json", false],
      ["ambient/bird/Idle/notes.txt", false],
    ] as const;
    for (const [path, expected] of birdPaths) {
      const v3 = worldV3.layout.some((entry) => entry.kind !== "folder" && entry.match.test(path));
      const v2 = worldV2.layout.some((entry) => entry.kind !== "folder" && entry.match.test(path));
      expect(v3, path).toBe(expected);
      expect(v2, path).toBe(false);
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
      const matched = themeV2.layout.some((entry) => entry.match.test(path));
      expect(matched, path).toBe(expected);
    }
  });

  it("[MAP-16] every rendered document names every rule and every layout entry", () => {
    for (const definition of [worldV2, worldV3, themeV2]) {
      const text = renderPackageDocument(definition);
      for (const rule of definition.rules) expect(text, rule.id).toContain(`\`${rule.id}\``);
      for (const entry of definition.layout) expect(text, entry.path).toContain(entry.path);
    }
  });
});
