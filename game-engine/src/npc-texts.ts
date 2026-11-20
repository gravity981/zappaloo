// The name of an NPC (MAP-21, GAME-37, GAME-39, GAME-40, CNT-09): what its label, its edge indicator and its bubble call it. Pure.
import type { PublicNpc } from "@zappaloo/shared";

/**
 * The name of an NPC (GAME-40): the figure name of its dialogue (`texts.title`, which the world lists for an NPC whose
 * action is a dialogue), else the title of the page its action opens (`actionTitle`), else the Tiled `label`, else
 * the name of the object.
 */
export function npcTitle(
  spec: { name: string; label?: string | undefined },
  texts: Pick<PublicNpc, "title"> | undefined,
  actionTitle?: string,
): string {
  return texts?.title ?? actionTitle ?? spec.label ?? spec.name;
}

/** The key of an NPC's texts and action in the world: `<map id>/<name>` (14.2). */
export const npcKey = (mapId: string, name: string): string => `${mapId}/${name}`;
