// The clickable objects and portals of a world's maps (sw-architecture.md 14.2, MAP-15): what the admin's list
// shows, and which objects exist, so that the admin's assignments follow the objects by their names.
import { presetActionOf, tiledMapSchema } from "@zappaloo/shared";
import type { WorldObjectAction } from "@zappaloo/shared";
import { flattenLayers } from "./layers.ts";

export interface MapClickable {
  name: string;
  label?: string;
  hidden: boolean;
  preset?: WorldObjectAction;
}

/** An NPC of a map (format version 3): the admin sets its action, name and short dialog (MAP-21). */
export interface MapNpc {
  name: string;
  label?: string;
  preset?: WorldObjectAction;
}

export interface MapPortal {
  name: string;
  targetMap?: string;
  targetSpawn?: string;
}

export interface MapObjects {
  id: string;
  name?: string;
  clickables: MapClickable[];
  npcs: MapNpc[];
  portals: MapPortal[];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** The objects of one map; a map that does not parse has none (the validator reported it). */
export function mapObjects(id: string, bytes: Buffer): MapObjects {
  const parsed = tiledMapSchema.safeParse(JSON.parse(bytes.toString("utf8")) as unknown);
  const result: MapObjects = { id, clickables: [], npcs: [], portals: [] };
  if (!parsed.success) return result;
  const name = text(parsed.data.properties?.find((property) => property.name === "name")?.value);
  if (name !== undefined) result.name = name;
  for (const layer of flattenLayers(parsed.data.layers)) {
    if (layer.type !== "objectgroup") continue;
    for (const object of layer.objects) {
      const type = object.type ?? object.class;
      const property = (key: string): unknown =>
        object.properties?.find((item) => item.name === key)?.value;
      if (type === "clickable" && object.name !== undefined) {
        const label = text(property("label"));
        const preset = presetActionOf(object.properties);
        result.clickables.push({
          name: object.name,
          ...(label === undefined ? {} : { label }),
          hidden: property("hidden") === true,
          ...(preset === undefined ? {} : { preset }),
        });
      } else if (type === "npc" && object.name !== undefined) {
        const label = text(property("label"));
        const preset = presetActionOf(object.properties);
        result.npcs.push({
          name: object.name,
          ...(label === undefined ? {} : { label }),
          ...(preset === undefined ? {} : { preset }),
        });
      } else if (type === "portal" && object.name !== undefined) {
        const targetMap = text(property("targetMap"));
        const targetSpawn = text(property("targetSpawn"));
        result.portals.push({
          name: object.name,
          ...(targetMap === undefined ? {} : { targetMap }),
          ...(targetSpawn === undefined ? {} : { targetSpawn }),
        });
      }
    }
  }
  return result;
}

/** The objects of every map of a package, by map id, in the order of the ids. */
export function packageObjects(maps: ReadonlyMap<string, Buffer>): MapObjects[] {
  return [...maps]
    .map(([id, bytes]) => mapObjects(id, bytes))
    .sort((a, b) => a.id.localeCompare(b.id));
}
