import type { LoadedWorld } from "@zappaloo/game-engine";

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
