// The select of the action of an object or an NPC (MAP-15, MAP-21): the action that applies, and the pages and
// dialogues to pick.
import type { WorldObjectAction, WorldObjects } from "@zappaloo/shared";
import { NO_ACTION, NONE_ACTION, selectValue } from "./world-actions.ts";

/** The select of the action of an object or an NPC: the action that applies, and the pages and dialogues to pick. */
export default function ActionSelect({
  ariaLabel,
  preset,
  effective,
  targets,
  actionName,
  busy,
  onChange,
}: {
  ariaLabel: string;
  preset: WorldObjectAction | undefined;
  effective: WorldObjectAction | undefined;
  targets: WorldObjects;
  actionName: (action: WorldObjectAction | undefined) => string;
  busy: boolean;
  onChange: (value: string) => void;
}) {
  const options = [
    ...targets.pages.map((page) => `page:${page}`),
    ...targets.dialogues.map((id) => `dialog:${id}`),
    // A preset can name a minigame, which an admin cannot assign (stage 8): it is listed so it can be shown.
    ...(preset?.kind === "minigame" ? [selectValue(preset)] : []),
  ];
  // The select shows the action that applies; a target that does not exist shows as «– keine –» (the preset
  // column says what is missing).
  const shown = selectValue(effective);
  const value = options.includes(shown) ? shown : NO_ACTION;
  const label = (option: string): string => {
    const [kind, ...rest] = option.split(":");
    const target = rest.join(":");
    if (kind === "page") return actionName({ kind: "page", page: target });
    if (kind === "dialog") return actionName({ kind: "dialog", dialogId: target });
    return actionName({ kind: "minigame", minigameId: target });
  };
  return (
    <select
      className="input auto"
      aria-label={ariaLabel}
      value={value}
      disabled={busy}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {label(option)}
        </option>
      ))}
      <option value={NO_ACTION}>{actionName(NONE_ACTION)}</option>
    </select>
  );
}
