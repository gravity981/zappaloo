// The title of what an object opens, for its edge indicator and its label in the game (GAME-40).
import type { TFunction } from "i18next";
import type { WorldObjectAction } from "@zappaloo/shared";

/**
 * A page's title: the built-in pages by their names in the navigation, a content page (`p/<slug>`) by its title. A
 * dialogue has none, because an object that shows one has no indicator or label, and a minigame has none yet
 * (stage 8): the object's own label or name stands then.
 */
export function objectTitle(
  action: WorldObjectAction,
  t: TFunction,
  pageTitles: ReadonlyMap<string, string>,
): string | undefined {
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
