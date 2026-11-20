// The id of a dialogue is made from the figure's name when it is created (CNT-09): the admin does not enter it. It is the
// `contentId` that Tiled presets name, so it is readable (`pfarrer-keller`) and never changes afterwards.
import { DIALOGUE_LIMITS } from "@zappaloo/shared";

/** A name as an id: German umlauts spelled out, other accents dropped, runs of anything else one dash; at most 40 characters. */
export function dialogueSlug(name: string): string {
  const spelled = name
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
  const plain = spelled
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return plain.slice(0, DIALOGUE_LIMITS.id).replace(/-+$/, "");
}

/** The id for a new dialogue: the slug of its name, with `-2`, `-3`, … when it is taken; `dialog` for a name without letters. */
export function newDialogueId(name: string, taken: (id: string) => boolean): string {
  const base = dialogueSlug(name) || "dialog";
  if (!taken(base)) return base;
  for (let number = 2; ; number++) {
    const suffix = `-${String(number)}`;
    const candidate = `${base.slice(0, DIALOGUE_LIMITS.id - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}
