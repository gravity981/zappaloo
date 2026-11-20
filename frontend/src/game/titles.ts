// The name of what an object or an NPC shows, for its edge indicator and its label in the game (GAME-40).
import type { TFunction } from "i18next";
import type { WorldObjectAction } from "@zappaloo/shared";

/**
 * A dialogue's figure name (CNT-09), a page's title (the built-in pages by their names in the navigation, a content
 * page `p/<slug>` by its title). A minigame has none yet (stage 8), and neither has a dialogue that no longer exists:
 * the object's own label or name stands then.
 */
export function objectTitle(
  action: WorldObjectAction,
  t: TFunction,
  pageTitles: ReadonlyMap<string, string>,
  dialogueNames: ReadonlyMap<string, string>,
): string | undefined {
  if (action.kind === "dialog") return dialogueNames.get(action.dialogId);
  if (action.kind !== "page") return undefined;
  switch (action.page) {
    case "programme":
      return t("nav.programme");
    case "rsvp":
      return t("nav.rsvp");
    case "profile":
      return t("nav.profile");
    case "seating":
      return t("seating.title");
    default:
      return pageTitles.get(action.page.replace(/^p\//, ""));
  }
}
