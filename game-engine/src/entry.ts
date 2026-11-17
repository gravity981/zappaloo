// Where a guest enters the world (sw-architecture.md 14.4, decided 2026-11-14): the selected map and spawn point,
// or the start map at its spawn point `start`. A portal leads to its `targetSpawn`.
import type { ParsedMap, PortalArea } from "./map-model.ts";
import type { LoadedWorld } from "./world-data.ts";
import { pointInPolygon, type Point } from "./geometry.ts";

/** The selected map and spawn point where a guest enters the world. */
export function entryPoint(
  world: LoadedWorld,
  selectedMap: string | undefined,
): { mapId: string; spawn: string } {
  return { mapId: selectedMap ?? world.startMap, spawn: "start" };
}

/** The position of a spawn point of a map; the start point when the named one does not exist. */
export function spawnPosition(map: ParsedMap, name: string): Point | undefined {
  return map.spawns.get(name) ?? map.spawns.get("start");
}

/** The portal whose trigger area contains the point and that has a target (GAME-03). */
export function portalAt(map: ParsedMap, point: Point): PortalArea | undefined {
  return map.portals.find(
    (portal) => portal.targetMap !== undefined && pointInPolygon(point, portal.polygon),
  );
}
