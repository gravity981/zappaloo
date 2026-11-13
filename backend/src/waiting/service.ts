// The waiting page of a closed platform (ACS-10 – ACS-13; sw-architecture.md 10.4): its
// settings (opening date, countdown switch, texts), what it shows to a guest, and the event's
// own door scene.
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  DEFAULT_WAITING_TEXTS,
  doorSheetSchema,
  fillWaitingText,
  WAITING_TEXT_KEYS,
} from "@zappaloo/shared";
import type {
  DoorResponse,
  RsvpStatus,
  WaitingConfig,
  WaitingPage,
  WaitingTextKey,
  WaitingUpdate,
} from "@zappaloo/shared";
import type { Database } from "../database/database.ts";
import { users, waitingConfig } from "../database/schema.ts";
import type { Actor, EventService } from "../event/service.ts";
import type { RsvpService } from "../rsvp/service.ts";

const COLUMNS = {
  none: "textNone",
  attending: "textAttending",
  declined: "textDeclined",
} as const;

/** The files of an event's own door scene, in `$DATA_DIR/events/<eventId>/`. */
export const DOOR_FILES = { sheet: "door.png", config: "door.json", glimpse: "door-glimpse.png" };

export class WaitingService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #rsvp: RsvpService;
  readonly #eventsDir: string;

  constructor(database: Database, event: EventService, rsvp: RsvpService, eventsDir: string) {
    this.#database = database;
    this.#event = event;
    this.#rsvp = rsvp;
    this.#eventsDir = eventsDir;
  }

  config(): WaitingConfig {
    const row = this.#database.db
      .select()
      .from(waitingConfig)
      .where(eq(waitingConfig.eventId, this.#event.eventId))
      .get();
    const stored = (key: WaitingTextKey) => row?.[COLUMNS[key]] ?? null;
    return {
      openingAt: row?.openingAt?.toISOString() ?? null,
      countdownEnabled: row?.countdownEnabled ?? false,
      texts: {
        none: stored("none") ?? DEFAULT_WAITING_TEXTS.none,
        attending: stored("attending") ?? DEFAULT_WAITING_TEXTS.attending,
        declined: stored("declined") ?? DEFAULT_WAITING_TEXTS.declined,
      },
      custom: {
        none: stored("none") !== null,
        attending: stored("attending") !== null,
        declined: stored("declined") !== null,
      },
    };
  }

  /** Changes the settings; a text of `null` goes back to the default. Audited, without the texts. */
  update(changes: WaitingUpdate, actor: Actor): WaitingConfig {
    this.#database.db.transaction((tx) => {
      const set: Partial<typeof waitingConfig.$inferInsert> = {};
      if (changes.openingAt !== undefined) {
        set.openingAt = changes.openingAt === null ? null : new Date(changes.openingAt);
      }
      if (changes.countdownEnabled !== undefined) set.countdownEnabled = changes.countdownEnabled;
      for (const key of WAITING_TEXT_KEYS) {
        const text = changes.texts?.[key];
        if (text !== undefined) set[COLUMNS[key]] = text;
      }
      tx.insert(waitingConfig)
        .values({ eventId: this.#event.eventId, ...set })
        .onConflictDoUpdate({ target: waitingConfig.eventId, set })
        .run();
      this.#event.audit(actor, "waiting.set", { fields: Object.keys(set).sort() }, tx);
    });
    return this.config();
  }

  /** What the waiting page shows to this user (ACS-11, ACS-13). */
  page(userId: number, isGuest: boolean): WaitingPage {
    const event = this.#event.get();
    const settings = this.config();
    let status: RsvpStatus = "none";
    if (isGuest) status = this.#rsvp.guestStatus(userId);
    const name =
      this.#database.db
        .select({ name: users.displayName })
        .from(users)
        .where(eq(users.id, userId))
        .get()?.name ?? "";
    const key: WaitingTextKey =
      status === "attending" ? "attending" : status === "declined" ? "declined" : "none";
    const openingDate = settings.openingAt
      ? new Intl.DateTimeFormat(event.defaultLanguage ?? "de", {
          dateStyle: "long",
          timeStyle: "short",
          ...(event.timezone ? { timeZone: event.timezone } : {}),
        }).format(new Date(settings.openingAt))
      : "bald";
    return {
      eventName: event.name ?? "",
      open: event.settings.platformOpen,
      status,
      text: fillWaitingText(settings.texts[key], {
        name,
        // The others who have accepted: an attending guest does not count themselves.
        waitingCount: String(this.#rsvp.acceptedCount(status === "attending" ? userId : undefined)),
        openingDate,
      }),
      countdownTo: settings.countdownEnabled ? settings.openingAt : null,
      rsvp: isGuest && event.features.rsvp,
    };
  }

  #file(name: string): string {
    return join(this.#eventsDir, this.#event.eventId, name);
  }

  /** The path of a door file if it exists. */
  doorFile(kind: "sheet" | "glimpse"): string | undefined {
    const path = this.#file(kind === "sheet" ? DOOR_FILES.sheet : DOOR_FILES.glimpse);
    return existsSync(path) ? path : undefined;
  }

  /**
   * The event's own door scene if `door.png` and a valid `door.json` are there; otherwise the
   * built-in scene (a broken file never breaks the waiting page).
   */
  door(): DoorResponse {
    const sheetPath = this.doorFile("sheet");
    const configPath = this.#file(DOOR_FILES.config);
    if (!sheetPath || !existsSync(configPath)) return { kind: "default" };
    try {
      const parsed = doorSheetSchema.safeParse(JSON.parse(readFileSync(configPath, "utf8")));
      if (!parsed.success) return { kind: "default" };
      const glimpsePath = this.doorFile("glimpse");
      const stamp = (path: string | undefined) =>
        path ? `${String(statSync(path).mtimeMs)}-${String(statSync(path).size)}` : "-";
      return {
        kind: "sheet",
        sheet: parsed.data,
        glimpse: glimpsePath !== undefined,
        version: `${stamp(sheetPath)}-${stamp(glimpsePath)}-${stamp(configPath)}`,
      };
    } catch {
      return { kind: "default" };
    }
  }
}
