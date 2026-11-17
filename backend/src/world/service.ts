// The world of the event (sw-architecture.md 14.4, MAP-04, MAP-05, MAP-08, MAP-09, MAP-10): importing a
// world package as a whole, rolling back to the previous one, and serving the active world. A package
// is validated before anything is written; it is staged in a folder and moved into place, and the rows
// and the audit entry change in one transaction. A failure leaves the active world as it was.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { contentPages, worldObjectActions, worldPackages } from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import { WORLD_BUILTIN_PAGES, worldActionSchema } from "@zappaloo/shared";
import type {
  PublicWorld,
  WorldObjectAction,
  WorldActionOverride,
  WorldActive,
  WorldObjects,
  WorldStatus,
} from "@zappaloo/shared";
import type { WorldFigure, WorldMapSummary } from "@zappaloo/shared";
import { checkWorldPackage } from "./validate.ts";
import type { WorldPackage } from "./validate.ts";
import type { WorldFinding } from "./findings.ts";
import { packageObjects, type MapObjects } from "./objects.ts";
import { presetWarnings } from "./presets.ts";
import { mapSummaries } from "./summary.ts";
import type { InstallationNames } from "./presets.ts";
import { warningFinding } from "./findings.ts";

/** A refused package: nothing was imported, and these are its findings (MAP-06). */
export class WorldRefused extends Error {
  readonly findings: WorldFinding[];

  constructor(findings: WorldFinding[]) {
    super("the world package was refused");
    this.name = "WorldRefused";
    this.findings = findings;
  }
}

/** Why an action could not be assigned (MAP-15). */
export class WorldObjectError extends Error {
  readonly code: "no_world" | "object_not_found" | "target_not_found";

  constructor(code: WorldObjectError["code"], message: string) {
    super(message);
    this.name = "WorldObjectError";
    this.code = code;
  }
}

/** A rollback without a previous world. */
export class NoPreviousWorld extends Error {
  constructor() {
    super("there is no previous world to roll back to");
    this.name = "NoPreviousWorld";
  }
}

/** The active or the previous world, as the database keeps it. */
export interface StoredWorld {
  importId: string;
  name: string;
  formatVersion: number;
  startMap: string;
  tileWidth: number;
  tileHeight: number;
  importedAt: Date;
  maps: WorldMapSummary[];
  /** The figures a guest can choose (`avatar/figures.json`). */
  figures: WorldFigure[];
  hasDoor: boolean;
  warnings: WorldFinding[];
}

/**
 * The files a player's browser may load from a world: maps, tileset images, and the figures' metadata and
 * frames (in their folders under avatar/). The manifest and the door scene are not served.
 */
const SERVED_FILE =
  /^(?:maps\/[a-z0-9-]{1,40}\.json|tilesets\/[A-Za-z0-9._-]+\.png|avatar\/figures\.json|avatar\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\.(?:png|json))$/;

type Row = typeof worldPackages.$inferSelect;

function toStored(row: Row): StoredWorld {
  return {
    importId: row.importId,
    name: row.name,
    formatVersion: row.formatVersion,
    startMap: row.startMap,
    tileWidth: row.tileWidth,
    tileHeight: row.tileHeight,
    importedAt: row.importedAt,
    maps: JSON.parse(row.maps) as WorldMapSummary[],
    figures: JSON.parse(row.avatar) as WorldFigure[],
    hasDoor: row.hasDoor,
    warnings: JSON.parse(row.warnings) as WorldFinding[],
  };
}

export class WorldService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #eventsDir: string;
  readonly #now: () => Date;

  constructor(
    database: Database,
    event: EventService,
    eventsDir: string,
    now: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#event = event;
    this.#eventsDir = eventsDir;
    this.#now = now;
  }

  /** The folder that holds the world packages of the event. */
  get directory(): string {
    return join(this.#eventsDir, this.#event.eventId, "world");
  }

  /** The stored world with the given role, or undefined. */
  #role(role: "active" | "previous"): StoredWorld | undefined {
    const row = this.#database.db
      .select()
      .from(worldPackages)
      .where(and(eq(worldPackages.eventId, this.#event.eventId), eq(worldPackages.role, role)))
      .get();
    return row === undefined ? undefined : toStored(row);
  }

  /** The active world, or undefined when none is imported. */
  active(): StoredWorld | undefined {
    return this.#role("active");
  }

  /** The admin's view of the worlds (MAP-05, MAP-09). */
  status(): WorldStatus {
    const active = this.active();
    const previous = this.#role("previous");
    return {
      active:
        active === undefined
          ? null
          : ({
              importId: active.importId,
              name: active.name,
              formatVersion: active.formatVersion,
              importedAt: active.importedAt.toISOString(),
              startMap: active.startMap,
              tileWidth: active.tileWidth,
              tileHeight: active.tileHeight,
              maps: active.maps,
              figures: active.figures.length,
              hasDoor: active.hasDoor,
              warnings: active.warnings,
            } satisfies WorldActive),
      previous:
        previous === undefined
          ? null
          : { name: previous.name, importedAt: previous.importedAt.toISOString() },
    };
  }

  /** What a player's browser loads (`GET /api/world`), or null while no world is active. */
  publicWorld(): PublicWorld | null {
    const active = this.active();
    if (active === undefined) return null;
    return {
      version: active.importId,
      name: active.name,
      startMap: active.startMap,
      tileWidth: active.tileWidth,
      tileHeight: active.tileHeight,
      maps: active.maps.map((map) => map.id),
      figures: active.figures,
      actions: this.#overridesOf(active),
    };
  }

  /** The maps of a stored world with their objects, read from its files. */
  #objectsOf(world: StoredWorld): MapObjects[] {
    const maps = new Map<string, Buffer>();
    for (const map of world.maps) {
      try {
        maps.set(
          map.id,
          readFileSync(join(this.directory, world.importId, "maps", `${map.id}.json`)),
        );
      } catch {
        // A map file that is gone has no objects; the world is not served either.
      }
    }
    return packageObjects(maps);
  }

  /** The assignments of the admin for objects that exist in the world; the others wait for their object. */
  #overridesOf(world: StoredWorld): WorldActionOverride[] {
    const existing = new Set(
      this.#objectsOf(world).flatMap((map) =>
        map.clickables.map((clickable) => `${map.id}/${clickable.name}`),
      ),
    );
    return this.#storedOverrides().filter((item) => existing.has(`${item.map}/${item.object}`));
  }

  #storedOverrides(): WorldActionOverride[] {
    return this.#database.db
      .select()
      .from(worldObjectActions)
      .where(eq(worldObjectActions.eventId, this.#event.eventId))
      .all()
      .flatMap((row) => {
        const action = worldActionSchema.safeParse(JSON.parse(row.action));
        return action.success
          ? [{ map: row.mapId, object: row.objectName, action: action.data }]
          : [];
      });
  }

  /** The pages, content pages and dialogues an action can point to. */
  #targets(): { pages: string[]; contentPages: string[]; dialogues: string[] } {
    const slugs = [...this.#installation().pageSlugs].sort();
    return {
      pages: [...WORLD_BUILTIN_PAGES, ...slugs.map((slug) => `p/${slug}`)],
      contentPages: slugs,
      dialogues: [...this.#installation().dialogueIds].sort(),
    };
  }

  /** The clickable objects and portals of every map, with the presets and the assignments (MAP-15). */
  objects(): WorldObjects {
    const active = this.active();
    const targets = this.#targets();
    if (active === undefined) return { maps: [], ...targets };
    const overrides = new Map(
      this.#storedOverrides().map((item) => [`${item.map}/${item.object}`, item.action]),
    );
    const missing = (action: WorldObjectAction | undefined): boolean => {
      if (action === undefined) return false;
      if (action.kind === "page") return !targets.pages.includes(action.page);
      if (action.kind === "content") return !targets.contentPages.includes(action.contentId);
      if (action.kind === "dialog") return !targets.dialogues.includes(action.dialogId);
      return action.kind === "minigame";
    };
    return {
      maps: this.#objectsOf(active).map((map) => ({
        id: map.id,
        ...(map.name === undefined ? {} : { name: map.name }),
        clickables: map.clickables.map((clickable) => {
          const override = overrides.get(`${map.id}/${clickable.name}`);
          return {
            name: clickable.name,
            ...(clickable.label === undefined ? {} : { label: clickable.label }),
            hidden: clickable.hidden,
            ...(clickable.preset === undefined ? {} : { preset: clickable.preset }),
            ...(override === undefined ? {} : { override }),
            missing: missing(override ?? clickable.preset),
          };
        }),
        portals: map.portals,
      })),
      ...targets,
    };
  }

  /**
   * Assigns an action to a clickable object of the active world, or returns it to its preset with `null`
   * (MAP-15). Live at once: the next load of the world reads it. The audit entry names ids only.
   */
  setAction(
    mapId: string,
    objectName: string,
    action: WorldObjectAction | null,
    actor: Actor,
  ): void {
    const active = this.active();
    if (active === undefined) throw new WorldObjectError("no_world", "no world is imported");
    const exists = this.#objectsOf(active).some(
      (map) => map.id === mapId && map.clickables.some((item) => item.name === objectName),
    );
    if (!exists) {
      throw new WorldObjectError(
        "object_not_found",
        `the map ${mapId} has no clickable object ${objectName}`,
      );
    }
    if (action !== null) {
      const targets = this.#targets();
      const known =
        action.kind === "page"
          ? targets.pages.includes(action.page)
          : action.kind === "content"
            ? targets.contentPages.includes(action.contentId)
            : action.kind === "dialog"
              ? targets.dialogues.includes(action.dialogId)
              : true;
      if (!known)
        throw new WorldObjectError("target_not_found", "the target of the action does not exist");
    }
    const key = and(
      eq(worldObjectActions.eventId, this.#event.eventId),
      eq(worldObjectActions.mapId, mapId),
      eq(worldObjectActions.objectName, objectName),
    );
    this.#database.db.transaction((tx) => {
      tx.delete(worldObjectActions).where(key).run();
      if (action !== null) {
        tx.insert(worldObjectActions)
          .values({
            eventId: this.#event.eventId,
            mapId,
            objectName,
            action: JSON.stringify(action),
          })
          .run();
      }
      this.#event.audit(actor, "world.action", { map: mapId, object: objectName }, tx);
    });
  }

  /** The folder of the active world's door scene (`door/` of the package), when it has one. */
  doorDirectory(): string | undefined {
    const active = this.active();
    if (!active?.hasDoor) return undefined;
    return join(this.directory, active.importId, "door");
  }

  /**
   * One file of the active or the previous world (a rolled-back world keeps its address). Only maps,
   * tileset images and avatar sprites are served; anything else is not there.
   */
  file(importId: string, path: string): Buffer | undefined {
    if (!SERVED_FILE.test(path)) return undefined;
    const known = [this.active(), this.#role("previous")].some(
      (item) => item?.importId === importId,
    );
    if (!known) return undefined;
    try {
      return readFileSync(join(this.directory, importId, path));
    } catch {
      return undefined;
    }
  }

  /** The names the installation has, for the warnings of an import (MAP-08). */
  #installation(): InstallationNames {
    const pages = this.#database.db
      .select({ slug: contentPages.slug })
      .from(contentPages)
      .where(eq(contentPages.eventId, this.#event.eventId))
      .all();
    // Dialogues are content items of stage 5g; until they exist, no dialogue is there.
    return { pageSlugs: new Set(pages.map((page) => page.slug)), dialogueIds: new Set() };
  }

  /** The maps of a package by their ids, as their bytes. */
  static #mapBytes(files: WorldPackage["files"]): Map<string, Buffer> {
    const maps = new Map<string, Buffer>();
    for (const [path, bytes] of files) {
      if (path.startsWith("maps/") && path.endsWith(".json")) {
        maps.set(path.slice("maps/".length, -".json".length), bytes);
      }
    }
    return maps;
  }

  /**
   * Imports a package as a whole (MAP-04, MAP-06, MAP-16). Throws `WorldRefused` with every finding when
   * the package is not valid; then nothing has changed.
   */
  async importPackage(archive: Buffer, actor: Actor): Promise<StoredWorld> {
    const check = checkWorldPackage(archive);
    if (!check.ok) throw new WorldRefused(check.findings);
    const { package: worldPackage } = check;
    const mapBytes = WorldService.#mapBytes(worldPackage.files);
    // An assignment follows its object by the map's id and the object's name; one whose object is gone is
    // dropped, and the import says so (MAP-15).
    const existing = new Set(
      packageObjects(mapBytes).flatMap((map) =>
        map.clickables.map((clickable) => `${map.id}/${clickable.name}`),
      ),
    );
    const dropped = this.#storedOverrides().filter(
      (item) => !existing.has(`${item.map}/${item.object}`),
    );
    const warnings = [
      ...check.findings,
      ...presetWarnings(mapBytes, this.#installation()),
      ...dropped.map((item) =>
        warningFinding(
          `maps/${item.map}.json`,
          "action_dropped",
          "the object no longer exists; the action assigned to it was removed",
          item.object,
        ),
      ),
    ];

    const summaries = mapSummaries(worldPackage.files);
    const importId = randomUUID();
    const staging = join(this.directory, `staging-${importId}`);
    const target = join(this.directory, importId);
    const previous = this.#role("previous");
    const importedAt = this.#now();
    try {
      await mkdir(staging, { recursive: true });
      for (const [path, data] of worldPackage.files) {
        await mkdir(dirname(join(staging, path)), { recursive: true });
        await writeFile(join(staging, path), data);
      }
      await rename(staging, target);
      this.#database.db.transaction((tx) => {
        const scope = eq(worldPackages.eventId, this.#event.eventId);
        // The world before the previous one goes; the active world becomes the previous one.
        tx.delete(worldPackages)
          .where(and(scope, eq(worldPackages.role, "previous")))
          .run();
        tx.update(worldPackages)
          .set({ role: "previous" })
          .where(and(scope, eq(worldPackages.role, "active")))
          .run();
        for (const item of dropped) {
          tx.delete(worldObjectActions)
            .where(
              and(
                eq(worldObjectActions.eventId, this.#event.eventId),
                eq(worldObjectActions.mapId, item.map),
                eq(worldObjectActions.objectName, item.object),
              ),
            )
            .run();
        }
        tx.insert(worldPackages)
          .values({
            importId,
            eventId: this.#event.eventId,
            role: "active",
            name: worldPackage.manifest.name,
            formatVersion: worldPackage.manifest.formatVersion,
            startMap: worldPackage.manifest.startMap,
            tileWidth: worldPackage.manifest.tileWidth,
            tileHeight: worldPackage.manifest.tileHeight,
            importedAt,
            maps: JSON.stringify(summaries),
            avatar: JSON.stringify(worldPackage.figures),
            hasDoor: worldPackage.door !== undefined,
            warnings: JSON.stringify(warnings),
          })
          .run();
        this.#event.audit(actor, "world.import", {}, tx);
      });
    } catch (error) {
      // Nothing was committed: the new files go, and the active world stays as it was.
      await rm(staging, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
      throw error;
    }
    // The world before the previous one is no longer read. A failure to remove its folder leaves the
    // folder behind; it does not undo or report the import, which has been committed.
    if (previous !== undefined) {
      await rm(join(this.directory, previous.importId), { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
    return {
      importId,
      name: worldPackage.manifest.name,
      formatVersion: worldPackage.manifest.formatVersion,
      startMap: worldPackage.manifest.startMap,
      tileWidth: worldPackage.manifest.tileWidth,
      tileHeight: worldPackage.manifest.tileHeight,
      importedAt,
      maps: summaries,
      figures: worldPackage.figures,
      hasDoor: worldPackage.door !== undefined,
      warnings,
    };
  }

  /** Makes the previous world the active one again; the active one becomes the previous (MAP-09). */
  rollback(actor: Actor): void {
    this.#database.db.transaction((tx) => {
      const scope = eq(worldPackages.eventId, this.#event.eventId);
      const rows = tx.select().from(worldPackages).where(scope).all();
      const active = rows.find((row) => row.role === "active");
      const previous = rows.find((row) => row.role === "previous");
      if (active === undefined || previous === undefined) throw new NoPreviousWorld();
      // Both rows are replaced: the roles are unique per event, so they are swapped by rewriting them.
      tx.delete(worldPackages).where(scope).run();
      tx.insert(worldPackages)
        .values({ ...previous, role: "active" })
        .run();
      tx.insert(worldPackages)
        .values({ ...active, role: "previous" })
        .run();
      this.#event.audit(actor, "world.rollback", {}, tx);
    });
  }
}
