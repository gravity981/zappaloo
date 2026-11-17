import { describe, expect, it } from "vitest";
import { entryPoint, portalAt } from "./entry.ts";
import type { ParsedMap } from "./map-model.ts";
import type { LoadedWorld } from "./world-data.ts";

const map = (id: string, portals: ParsedMap["portals"] = []) =>
  ({ id, portals, spawns: new Map(), name: id }) as unknown as ParsedMap;
const world = (maps: ParsedMap[]) =>
  ({
    version: "v",
    name: "w",
    startMap: "kirche",
    maps: new Map(maps.map((m) => [m.id, m])),
  }) as unknown as LoadedWorld;

describe("where a guest enters the world (GAME-03, 14.4)", () => {
  it("[GAME-03] a guest enters the start map at its spawn point when no map was remembered", () => {
    expect(entryPoint(world([map("kirche")]), undefined)).toEqual({
      mapId: "kirche",
      spawn: "start",
    });
  });

  it("[GAME-04] nothing locks an area: a portal leads on whenever the player is inside it, whatever the schedule", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const garden = map("kirche", [
      { name: "zum-garten", objectId: 1, polygon, targetMap: "garten", targetSpawn: "start" },
    ]);
    // portalAt takes a point and nothing else: no time, no condition (the conditions come with ACS-05).
    expect(portalAt(garden, { x: 5, y: 5 })?.targetMap).toBe("garten");
  });

  it("[GAME-03] a portal with a target leads on when the player is inside it", () => {
    const polygon = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const withTarget = map("kirche", [
      { name: "zum-garten", objectId: 1, polygon, targetMap: "garten", targetSpawn: "start" },
    ]);
    expect(portalAt(withTarget, { x: 5, y: 5 })?.targetMap).toBe("garten");
    expect(portalAt(withTarget, { x: 50, y: 5 })).toBeUndefined();
    const withoutTarget = map("kirche", [{ name: "leer", objectId: 2, polygon }]);
    expect(portalAt(withoutTarget, { x: 5, y: 5 })).toBeUndefined();
  });
});
