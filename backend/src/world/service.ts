// The world of the event (sw-architecture.md 14.4, MAP-04, MAP-05, MAP-08, MAP-09, MAP-10): importing a
// world package as a whole, rolling back to the previous one, and serving the active world. A package
// is validated before anything is written; it is staged in a folder and moved into place, and the rows
// and the audit entry change in one transaction. A failure leaves the active world as it was.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import {
  contentPages,
  eventSettings,
  worldObjectActions,
  worldPackages,
} from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import { WORLD_BUILTIN_PAGES, WORLD_FILE_SEGMENT, worldActionSchema } from "@zappaloo/shared";
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
import { isSafePath } from "../packages/archive.ts";

/** The name of the guest-access switch among the event's settings (MAP-19). */
const GUEST_ACCESS_SETTING = "worldGuestAccess";

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
const SEGMENT = WORLD_FILE_SEGMENT.source.slice(1, -1);
const SERVED_FILE = new RegExp(
  `^(?:maps\\/[a-z0-9-]{1,40}\\.json|tilesets\\/${SEGMENT}\\.png|avatar\\/figures\\.json|avatar\\/(?:${SEGMENT}\\/)+${SEGMENT}\\.(?:png|json))$`,
);

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
  /** The end of the imports and rollbacks so far: each one waits for the one before it (see #exclusive). */
  #queue: Promise<unknown> = Promise.resolve();
  /** The objects of each imported world, read once: the files of an import never change. */
  readonly #objectCache = new Map<string, MapObjects[]>();

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

  /**
   * Whether guests may enter the world (MAP-19). It is kept in the event's settings under its own name and is switched
   * on by the first successful import; without that setting, an installation that has a world from before the switch
   * counts as enabled.
   */
  guestAccess(): boolean {
    const row = this.#database.db
      .select()
      .from(eventSettings)
      .where(
        and(
          eq(eventSettings.eventId, this.#event.eventId),
          eq(eventSettings.name, GUEST_ACCESS_SETTING),
        ),
      )
      .get();
    return row === undefined ? this.active() !== undefined : row.value;
  }

  /** Switches guest access; returns false when it already had that value. Audited. */
  setGuestAccess(enabled: boolean, actor: Actor): boolean {
    return this.#database.db.transaction((tx) => {
      if (this.guestAccess() === enabled) return false;
      tx.insert(eventSettings)
        .values({ eventId: this.#event.eventId, name: GUEST_ACCESS_SETTING, value: enabled })
        .onConflictDoUpdate({
          target: [eventSettings.eventId, eventSettings.name],
          set: { value: enabled },
        })
        .run();
      this.#event.audit(actor, "world.guest_access", { enabled }, tx);
      return true;
    });
  }

  /** The admin's view of the worlds (MAP-05, MAP-09). */
  status(): WorldStatus {
    const active = this.active();
    const previous = this.#role("previous");
    return {
      guestAccess: this.guestAccess(),
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
    const cached = this.#objectCache.get(world.importId);
    if (cached !== undefined) return cached;
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
    const objects = packageObjects(maps);
    this.#objectCache.set(world.importId, objects);
    return objects;
  }

  /** Runs one import or rollback after the ones started before it; a failure does not stop the queue. */
  #exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.#queue.then(work);
    this.#queue = run.catch(() => undefined);
    return run;
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
  #targets(): { pages: string[]; dialogues: string[] } {
    const slugs = [...this.#installation().pageSlugs].sort();
    return {
      pages: [...WORLD_BUILTIN_PAGES, ...slugs.map((slug) => `p/${slug}`)],
      dialogues: [...this.#installation().dialogueIds].sort(),
    };
  }

  /** The clickable objects and portals of every map, with the presets and the assignments (MAP-15). */
  objects(): WorldObjects {
    const active = this.active();
    const targets = this.#targets();
    if (active === undefined) return { startMap: "", maps: [], ...targets };
    const overrides = new Map(
      this.#storedOverrides().map((item) => [`${item.map}/${item.object}`, item.action]),
    );
    const missing = (action: WorldObjectAction | undefined): boolean => {
      if (action === undefined) return false;
      if (action.kind === "page") return !targets.pages.includes(action.page);
      if (action.kind === "dialog") return !targets.dialogues.includes(action.dialogId);
      return action.kind === "minigame";
    };
    return {
      startMap: active.startMap,
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
    if (!SERVED_FILE.test(path) || !isSafePath(path)) return undefined;
    const known = [this.active(), this.#role("previous")].some(
      (item) => item?.importId === importId,
    );
    if (!known) return undefined;
    // Last guard: the resolved file must lie inside the world's folder, whatever the path encodes.
    const root = resolve(this.directory, importId);
    const full = resolve(root, path);
    if (!full.startsWith(root + sep)) return undefined;
    try {
      return readFileSync(full);
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
    // Dialogues are content items of step 6d; until they exist, no dialogue is there.
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
  /** Imports a world package as the active world; imports and rollbacks run one at a time (MAP-09). */
  importPackage(archive: Buffer, actor: Actor): Promise<StoredWorld> {
    return this.#exclusive(() => this.#importPackage(archive, actor));
  }

  async #importPackage(archive: Buffer, actor: Actor): Promise<StoredWorld> {
    const check = checkWorldPackage(archive);
    if (!check.ok) throw new WorldRefused(check.findings);
    const { package: worldPackage } = check;
    const mapBytes = WorldService.#mapBytes(worldPackage.files);
    // An assignment follows its object by the map's id and the object's name. One whose object the package lacks
    // stays: it is listed as unmatched, and it applies again after a rollback or when the object returns (MAP-15).
    const existing = new Set(
      packageObjects(mapBytes).flatMap((map) =>
        map.clickables.map((clickable) => `${map.id}/${clickable.name}`),
      ),
    );
    const unmatched = this.#storedOverrides().filter(
      (item) => !existing.has(`${item.map}/${item.object}`),
    );
    const warnings = [
      ...check.findings,
      ...presetWarnings(mapBytes, this.#installation()),
      ...unmatched.map((item) =>
        warningFinding(
          `maps/${item.map}.json`,
          "action_unmatched",
          "the object no longer exists; its assigned action is kept and applies again if the object returns",
          item.object,
        ),
      ),
    ];

    const summaries = mapSummaries(worldPackage.files);
    const importId = randomUUID();
    const staging = join(this.directory, `staging-${importId}`);
    const target = join(this.directory, importId);
    const importedAt = this.#now();
    try {
      await mkdir(staging, { recursive: true });
      for (const [path, data] of worldPackage.files) {
        await mkdir(dirname(join(staging, path)), { recursive: true });
        await writeFile(join(staging, path), data);
      }
      await rename(staging, target);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
      throw error;
    }
    let removed: string | undefined;
    try {
      removed = this.#database.db.transaction((tx) => {
        const scope = eq(worldPackages.eventId, this.#event.eventId);
        // The folder to remove is the one of the row this transaction deletes, read inside it.
        const dropping = tx
          .select({ importId: worldPackages.importId })
          .from(worldPackages)
          .where(and(scope, eq(worldPackages.role, "previous")))
          .get();
        // The world before the previous one goes; the active world becomes the previous one.
        tx.delete(worldPackages)
          .where(and(scope, eq(worldPackages.role, "previous")))
          .run();
        tx.update(worldPackages)
          .set({ role: "previous" })
          .where(and(scope, eq(worldPackages.role, "active")))
          .run();
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
        // The first import switches guest access on; after that the admin decides, and a new import keeps it (MAP-19).
        tx.insert(eventSettings)
          .values({ eventId: this.#event.eventId, name: GUEST_ACCESS_SETTING, value: true })
          .onConflictDoNothing()
          .run();
        this.#event.audit(actor, "world.import", {}, tx);
        return dropping?.importId;
      });
    } catch (error) {
      // Nothing was committed: the new files go, and the active world stays as it was.
      await rm(staging, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
      throw error;
    }
    // The world before the previous one is no longer read. A failure to remove its folder leaves the
    // folder behind; it does not undo or report the import, which has been committed.
    if (removed !== undefined) {
      this.#objectCache.delete(removed);
      await rm(join(this.directory, removed), { recursive: true, force: true }).catch(
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
  rollback(actor: Actor): Promise<void> {
    return this.#exclusive(() => {
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
      return Promise.resolve();
    });
  }
}
