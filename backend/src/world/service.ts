// The world of the event (sw-architecture.md 14.4, MAP-04, MAP-05, MAP-08, MAP-09, MAP-10): importing a
// world package as a whole, rolling back to the previous one, and serving the active world. A package
// is validated before anything is written; it is staged in a folder and moved into place, and the rows
// and the audit entry change in one transaction. A failure leaves the active world as it was.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { and, eq } from "drizzle-orm";
import { contentPages, worldPackages } from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { PublicWorld, WorldActive, WorldStatus } from "@zappaloo/shared";
import type { WorldAvatar } from "@zappaloo/shared";
import { checkWorldPackage } from "./validate.ts";
import type { WorldPackage } from "./validate.ts";
import type { WorldFinding } from "./findings.ts";
import { presetWarnings } from "./presets.ts";
import type { InstallationNames } from "./presets.ts";

/** A refused package: nothing was imported, and these are its findings (MAP-06). */
export class WorldRefused extends Error {
  readonly findings: WorldFinding[];

  constructor(findings: WorldFinding[]) {
    super("the world package was refused");
    this.name = "WorldRefused";
    this.findings = findings;
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
  tileSize: number;
  importedAt: Date;
  maps: string[];
  avatar: WorldAvatar;
  hasDoor: boolean;
  warnings: WorldFinding[];
}

/** The files a player's browser may load from a world: maps, tileset images and avatar sprites. */
const SERVED_FILE =
  /^(?:maps\/[a-z0-9-]{1,40}\.json|tilesets\/[A-Za-z0-9._-]+\.png|avatar\/[A-Za-z0-9._-]+\.png)$/;

type Row = typeof worldPackages.$inferSelect;

function toStored(row: Row): StoredWorld {
  return {
    importId: row.importId,
    name: row.name,
    formatVersion: row.formatVersion,
    startMap: row.startMap,
    tileSize: row.tileSize,
    importedAt: row.importedAt,
    maps: JSON.parse(row.maps) as string[],
    avatar: JSON.parse(row.avatar) as WorldAvatar,
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
              tileSize: active.tileSize,
              maps: active.maps,
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
      tileSize: active.tileSize,
      maps: active.maps,
      avatar: active.avatar,
    };
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
    const warnings = [
      ...check.findings,
      ...presetWarnings(WorldService.#mapBytes(worldPackage.files), this.#installation()),
    ];

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
        tx.insert(worldPackages)
          .values({
            importId,
            eventId: this.#event.eventId,
            role: "active",
            name: worldPackage.manifest.name,
            formatVersion: worldPackage.manifest.formatVersion,
            startMap: worldPackage.manifest.startMap,
            tileSize: worldPackage.manifest.tileSize,
            importedAt,
            maps: JSON.stringify(worldPackage.mapIds),
            avatar: JSON.stringify(worldPackage.avatar),
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
      tileSize: worldPackage.manifest.tileSize,
      importedAt,
      maps: worldPackage.mapIds,
      avatar: worldPackage.avatar,
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
