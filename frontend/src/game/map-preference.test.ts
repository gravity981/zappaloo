import { describe, expect, it } from "vitest";
import { LAST_MAP_KEY, rememberedMap, rememberMap } from "./map-preference.ts";
import type { LoadedWorld, ParsedMap } from "@zappaloo/game-engine";

const map = (id: string) => ({ id }) as unknown as ParsedMap;
const world = (maps: ParsedMap[]) =>
  ({
    startMap: "kirche",
    maps: new Map(maps.map((m) => [m.id, m])),
  }) as unknown as LoadedWorld;

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("remembering the guest's map (GAME-03, 14.4)", () => {
  it("[GAME-03] the last map of the device is remembered, but only while it is part of the world", () => {
    const w = world([map("kirche"), map("garten")]);
    expect(rememberedMap(w, storage({ [LAST_MAP_KEY]: "garten" }))).toBe("garten");
    expect(rememberedMap(w, storage({ [LAST_MAP_KEY]: "abgerissen" }))).toBeUndefined();
  });

  it("[GAME-03] storage that is not available is no error", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(rememberedMap(world([map("kirche")]), broken)).toBeUndefined();
    expect(() => {
      rememberMap("garten", broken);
    }).not.toThrow();
  });
});
