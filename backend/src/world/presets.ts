// The warnings that depend on the installation (sw-architecture.md 14.2, 14.4, MAP-08): a clickable
// object whose preset action points to a page, content page, dialogue or minigame that does not
// exist. They are reported at import and never refuse the package; the validator of the package
// (`zappaloo validate`) does not know the installation and leaves them out.
import { tiledMapSchema, WORLD_BUILTIN_PAGES } from "@zappaloo/shared";
import type { TiledObject } from "@zappaloo/shared";
import { warningFinding } from "./findings.ts";
import type { WorldFinding } from "./findings.ts";

/** What the installation has: the slugs of its content pages and the ids of its dialogues. */
export interface InstallationNames {
  pageSlugs: ReadonlySet<string>;
  dialogueIds: ReadonlySet<string>;
}

/** The properties of an object by name (Tiled's custom properties). */
function propertyValues(object: TiledObject): Map<string, unknown> {
  return new Map((object.properties ?? []).map((property) => [property.name, property.value]));
}

/**
 * The preset warnings of a package. `maps` holds the bytes of each map by its id. Minigames do not
 * exist before stage 8, so every minigame preset is reported (MAP-08).
 */
export function presetWarnings(
  maps: ReadonlyMap<string, Buffer>,
  names: InstallationNames,
): WorldFinding[] {
  const findings: WorldFinding[] = [];
  for (const [id, bytes] of maps) {
    const file = `maps/${id}.json`;
    const parsed = tiledMapSchema.safeParse(JSON.parse(bytes.toString("utf8")) as unknown);
    if (!parsed.success) continue; // the validator reported it
    for (const layer of parsed.data.layers) {
      if (layer.type !== "objectgroup") continue;
      for (const object of layer.objects) {
        if ((object.type ?? object.class) !== "clickable") continue;
        const label = object.name ?? `object ${String(object.id)}`;
        const values = propertyValues(object);
        const action = values.get("action");
        if (action === "page") {
          const page = values.get("page");
          if (typeof page === "string" && page.startsWith("p/")) {
            if (!names.pageSlugs.has(page.slice(2))) {
              findings.push(
                warningFinding(file, "preset_missing", `the page ${page} does not exist`, label),
              );
            }
          } else if (
            typeof page === "string" &&
            !(WORLD_BUILTIN_PAGES as readonly string[]).includes(page)
          ) {
            findings.push(
              warningFinding(file, "preset_missing", `the page ${page} does not exist`, label),
            );
          }
        } else if (action === "content") {
          const contentId = String(values.get("contentId"));
          if (!names.pageSlugs.has(contentId)) {
            findings.push(
              warningFinding(
                file,
                "preset_missing",
                `the content page ${contentId} does not exist`,
                label,
              ),
            );
          }
        } else if (action === "dialog") {
          const contentId = String(values.get("contentId"));
          if (!names.dialogueIds.has(contentId)) {
            findings.push(
              warningFinding(
                file,
                "preset_missing",
                `the dialogue ${contentId} does not exist`,
                label,
              ),
            );
          }
        } else if (action === "minigame") {
          const minigameId = String(values.get("minigameId"));
          findings.push(
            warningFinding(
              file,
              "preset_minigame",
              `the minigame ${minigameId} cannot be started yet (minigames come with a later stage)`,
              label,
            ),
          );
        }
      }
    }
  }
  return findings;
}
