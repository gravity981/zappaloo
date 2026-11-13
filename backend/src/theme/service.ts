// The theme of the event (sw-architecture.md 19.7, THM-01, THM-04, THM-05): importing a package as a
// whole, and returning to the default theme. A package is validated before anything is written; it is
// written to a staging folder and moved into place; the database row changes in one transaction with
// its audit entry. A failure leaves the active theme as it was.
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import type { ThemeJson, ThemeStatus } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { themeActive } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import { checkThemePackage } from "./validate.ts";
import type { ThemeFinding } from "./validate.ts";

/** A refused package: nothing was imported, and these are its findings. */
export class ThemeRefused extends Error {
  readonly findings: ThemeFinding[];

  constructor(findings: ThemeFinding[]) {
    super("the theme package was refused");
    this.name = "ThemeRefused";
    this.findings = findings;
  }
}

export interface ActiveTheme {
  importId: string;
  name: string;
  formatVersion: number;
  importedAt: Date;
  colors: ThemeJson["colors"];
  fonts: ThemeJson["fonts"] | null;
}

export class ThemeService {
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

  /** The folder that holds the packages of the event. */
  get directory(): string {
    return join(this.#eventsDir, this.#event.eventId, "theme");
  }

  /** The active theme, or undefined for the platform's default. */
  active(): ActiveTheme | undefined {
    const row = this.#database.db
      .select()
      .from(themeActive)
      .where(eq(themeActive.eventId, this.#event.eventId))
      .get();
    if (!row) return undefined;
    return {
      importId: row.importId,
      name: row.name,
      formatVersion: row.formatVersion,
      importedAt: row.importedAt,
      colors: JSON.parse(row.colors) as ThemeJson["colors"],
      fonts: row.fonts === null ? null : (JSON.parse(row.fonts) as ThemeJson["fonts"]),
    };
  }

  /** The status the admin area shows. */
  status(): ThemeStatus {
    const active = this.active();
    return {
      active:
        active === undefined
          ? null
          : {
              name: active.name,
              formatVersion: active.formatVersion,
              importedAt: active.importedAt.toISOString(),
            },
    };
  }

  /**
   * Imports a package as a whole (THM-04). Throws `ThemeRefused` with every finding when the package
   * is not valid; then nothing has changed.
   */
  async importPackage(archive: Buffer, actor: Actor): Promise<ActiveTheme> {
    const check = checkThemePackage(archive);
    if (!check.ok) throw new ThemeRefused(check.findings);
    const { package: themePackage } = check;

    const importId = randomUUID();
    const staging = join(this.directory, `staging-${importId}`);
    const target = join(this.directory, importId);
    const previous = this.active();
    try {
      await mkdir(staging, { recursive: true });
      for (const [path, data] of themePackage.files) {
        await mkdir(dirname(join(staging, path)), { recursive: true });
        await writeFile(join(staging, path), data);
      }
      await rename(staging, target);
      const importedAt = this.#now();
      this.#database.db.transaction((tx) => {
        tx.insert(themeActive)
          .values({
            eventId: this.#event.eventId,
            importId,
            name: themePackage.manifest.name,
            formatVersion: themePackage.manifest.formatVersion,
            importedAt,
            colors: JSON.stringify(themePackage.theme.colors),
            fonts:
              themePackage.theme.fonts === undefined
                ? null
                : JSON.stringify(themePackage.theme.fonts),
          })
          .onConflictDoUpdate({
            target: themeActive.eventId,
            set: {
              importId,
              name: themePackage.manifest.name,
              formatVersion: themePackage.manifest.formatVersion,
              importedAt,
              colors: JSON.stringify(themePackage.theme.colors),
              fonts:
                themePackage.theme.fonts === undefined
                  ? null
                  : JSON.stringify(themePackage.theme.fonts),
            },
          })
          .run();
        this.#event.audit(actor, "theme.import", {}, tx);
      });
      if (previous !== undefined)
        await rm(join(this.directory, previous.importId), { recursive: true, force: true });
      return {
        importId,
        name: themePackage.manifest.name,
        formatVersion: themePackage.manifest.formatVersion,
        importedAt,
        colors: themePackage.theme.colors,
        fonts: themePackage.theme.fonts ?? null,
      };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      await rm(target, { recursive: true, force: true });
      throw error;
    }
  }

  /** Returns to the platform's default theme (THM-05). */
  async reset(actor: Actor): Promise<void> {
    const previous = this.active();
    if (previous === undefined) return;
    this.#database.db.transaction((tx) => {
      tx.delete(themeActive).where(eq(themeActive.eventId, this.#event.eventId)).run();
      this.#event.audit(actor, "theme.reset", {}, tx);
    });
    await rm(join(this.directory, previous.importId), { recursive: true, force: true });
  }
}
