// The summary of each map of a world, for the admin's world card (sw-architecture.md 14.4; mock
// admin-world, variant "import"): how many clickable objects and portals the map has.
import { tiledMapSchema } from "@zappaloo/shared";
import type { WorldMapSummary } from "@zappaloo/shared";

/** The summaries of the maps of a package, by map id. */
export function mapSummaries(files: ReadonlyMap<string, Buffer>): WorldMapSummary[] {
  const summaries: WorldMapSummary[] = [];
  for (const [path, bytes] of files) {
    if (!/^maps\/[^/]+\.json$/.test(path)) continue;
    const id = path.slice("maps/".length, -".json".length);
    const parsed = tiledMapSchema.safeParse(JSON.parse(bytes.toString("utf8")) as unknown);
    const nameProperty = parsed.success
      ? parsed.data.properties?.find((property) => property.name === "name")?.value
      : undefined;
    const name = typeof nameProperty === "string" ? nameProperty : undefined;
    let clickable = 0;
    let portals = 0;
    if (parsed.success) {
      for (const layer of parsed.data.layers) {
        if (layer.type !== "objectgroup") continue;
        for (const object of layer.objects) {
          const type = object.type ?? object.class;
          if (type === "clickable") clickable += 1;
          if (type === "portal") portals += 1;
        }
      }
    }
    summaries.push(
      name === undefined ? { id, clickable, portals } : { id, name, clickable, portals },
    );
  }
  return summaries.sort((a, b) => a.id.localeCompare(b.id));
}
