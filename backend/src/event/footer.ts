// The footer: the admin's copyright line, the repository address and the license text
// (LIC-01 – LIC-03; sw-architecture.md 19.6).
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import type { FooterConfig } from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { footerNotice } from "../database/schema.ts";
import type { Actor, EventService } from "./service.ts";

/** The license of the running version: the `LICENSE` file at the root of the repository and the image. */
const LICENSE_FILE = new URL("../../../LICENSE", import.meta.url);

export class FooterService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #now: () => Date;
  readonly sourceUrl: string;
  #license: string | undefined;

  constructor(
    database: Database,
    event: EventService,
    sourceUrl: string,
    now: () => Date = () => new Date(),
  ) {
    this.#database = database;
    this.#event = event;
    this.sourceUrl = sourceUrl;
    this.#now = now;
  }

  /** `© <year> <event name>`, the year in the event's time zone; null before the event has a name. */
  defaultCopyright(): string | null {
    const { name, timezone } = this.#event.get();
    if (name === null) return null;
    const year = new Intl.DateTimeFormat("en", {
      year: "numeric",
      ...(timezone === null ? {} : { timeZone: timezone }),
    }).format(this.#now());
    return `© ${year} ${name}`;
  }

  #row() {
    return this.#database.db
      .select()
      .from(footerNotice)
      .where(eq(footerNotice.eventId, this.#event.eventId))
      .get();
  }

  /** The line the footer shows; null when there is none (hidden, or no name yet). */
  copyright(): string | null {
    const row = this.#row();
    if (row) return row.copyright === "" ? null : row.copyright;
    return this.defaultCopyright();
  }

  config(): FooterConfig {
    return {
      copyright: this.copyright() ?? "",
      custom: this.#row() !== undefined,
      defaultCopyright: this.defaultCopyright(),
    };
  }

  /** Saves the admin's line ("" hides it), or goes back to the default with `null`. Audited without the text. */
  set(copyright: string | null, actor: Actor): FooterConfig {
    this.#database.db.transaction((tx) => {
      if (copyright === null) {
        tx.delete(footerNotice).where(eq(footerNotice.eventId, this.#event.eventId)).run();
      } else {
        tx.insert(footerNotice)
          .values({ eventId: this.#event.eventId, copyright, updatedAt: this.#now() })
          .onConflictDoUpdate({
            target: footerNotice.eventId,
            set: { copyright, updatedAt: this.#now() },
          })
          .run();
      }
      this.#event.audit(actor, "footer.set", { reset: copyright === null }, tx);
    });
    return this.config();
  }

  /** The text of the AGPL-3.0, read once. */
  license(): string {
    this.#license ??= readFileSync(LICENSE_FILE, "utf8");
    return this.#license;
  }
}
