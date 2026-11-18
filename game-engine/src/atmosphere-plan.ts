// Which effects of the atmosphere a map gets (GAME-31 – GAME-34): the fog needs a border and does not move, so it stays
// with reduced motion; the cloud shadows and the birds are not shown when the device asks for reduced motion
// (decided 2026-11-18), and the birds need a bird in the world. Each effect can be switched off by a map property.
import type { Point } from "./geometry.ts";
import type { MapAtmosphere } from "./map-model.ts";

export interface AtmospherePlan {
  fog: boolean;
  clouds: boolean;
  birds: boolean;
}

export function atmospherePlan(
  map: { atmosphere: MapAtmosphere; obstacles: { borders: readonly (readonly Point[])[] } },
  world: { bird?: unknown },
  reducedMotion: boolean,
): AtmospherePlan {
  return {
    // A map without a border has no fog (GAME-33); the fog does not move, so it stays with reduced motion.
    fog: map.atmosphere.fog && map.obstacles.borders.length > 0,
    clouds: map.atmosphere.clouds && !reducedMotion,
    birds: map.atmosphere.birds && world.bird !== undefined && !reducedMotion,
  };
}

/** Whether the device asks for reduced motion. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
