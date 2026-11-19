// The texts of an NPC (MAP-21, GAME-37, GAME-39): the name it is shown with, and what its bubble says. Pure.
import type { PublicNpc } from "@zappaloo/shared";

/** The name of an NPC: the admin's, else the Tiled `label`, else the name of the object (decided 2026-11-18). */
export function npcTitle(
  spec: { name: string; label?: string | undefined },
  texts: Pick<PublicNpc, "title"> | undefined,
): string {
  return texts?.title ?? spec.label ?? spec.name;
}

/** The key of an NPC's texts and action in the world: `<map id>/<name>` (14.2). */
export const npcKey = (mapId: string, name: string): string => `${mapId}/${name}`;
