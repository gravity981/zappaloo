// Where a guest enters the world (sw-architecture.md 14.4, decided 2026-11-14): the last map is remembered on the
// device; otherwise, and when that map no longer exists, the start map at its spawn point `start`. A portal leads
// to its `targetSpawn`. Storage can be unavailable (private windows), so every access is guarded.
import type { ParsedMap, PortalArea } from "./map-model.ts";
import type { LoadedWorld } from "./world-data.ts";
import { pointInPolygon, type Point } from "./geometry.ts";

export const LAST_MAP_KEY = "zappaloo.game.lastMap";

/** The map a guest last visited on this device, if it is still part of the world. */
export function rememberedMap(
  world: LoadedWorld,
  storage: Pick<Storage, "getItem"> | undefined,
): string | undefined {
  try {
    const id = storage?.getItem(LAST_MAP_KEY) ?? null;
    return id !== null && world.maps.has(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

/** Remembers the map a guest is on, for the next entry. Failures are ignored. */
export function rememberMap(id: string, storage: Pick<Storage, "setItem"> | undefined): void {
  try {
    storage?.setItem(LAST_MAP_KEY, id);
  } catch {
    // Without storage, the next entry starts at the start map.
  }
}

/** The map and the spawn point where a guest enters the world. */
export function entryPoint(
  world: LoadedWorld,
  remembered: string | undefined,
): { mapId: string; spawn: string } {
  return { mapId: remembered ?? world.startMap, spawn: "start" };
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
