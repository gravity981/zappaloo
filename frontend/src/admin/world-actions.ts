// The action of an object or an NPC as the admin's select shows it (MAP-15, MAP-21): the values of the options, and
// and which action a select value stands for.
import type { WorldObjectAction } from "@zappaloo/shared";

/** The value of the select for "no action". */
export const NO_ACTION = "none";
export const NONE_ACTION: WorldObjectAction = { kind: "none" };

/** The value of the select for an action. */
export function selectValue(action: WorldObjectAction | undefined): string {
  if (action === undefined) return NO_ACTION;
  switch (action.kind) {
    case "page":
      return `page:${action.page}`;
    case "dialog":
      return `dialog:${action.dialogId}`;
    case "minigame":
      return `minigame:${action.minigameId}`;
    case "none":
      return NO_ACTION;
  }
}

/** The action a select value stands for. */
export function actionOfValue(value: string): WorldObjectAction {
  if (value === NO_ACTION) return NONE_ACTION;
  const [kind, ...rest] = value.split(":");
  const target = rest.join(":");
  if (kind === "page") return { kind: "page", page: target };
  return { kind: "dialog", dialogId: target };
}
